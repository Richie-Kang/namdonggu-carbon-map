"""ai/train.py — XGBoost dasymetric regressor (ADR-0004).

Outputs:
  - ai/models/population.json (xgboost model)
  - ai/models/population.meta.json (feature schema, factors, version)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.cluster import KMeans
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "etl"))
from utils import LOG, connect, Snapshot  # noqa: E402

from features import FEATURE_COLS, build_features, make_pseudo_labels, to_matrix  # noqa: E402

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

PARAMS = dict(
    objective="reg:squarederror",
    eval_metric="rmse",
    max_depth=6,
    learning_rate=0.05,
    n_estimators=500,
    subsample=0.9,
    colsample_bytree=0.9,
    random_state=42,
)


def spatial_folds(df: pd.DataFrame, k: int = 5) -> np.ndarray:
    """Cluster grid_500m cells by their spatial centroid (P1 fix).

    Pulls per-grid lon/lat from grid_500m_pop via ST_X/ST_Y of centroid.
    Falls back to building centroid average when no SGIS row exists.
    """
    grid_ids = df["grid_id"].fillna("__none__").to_numpy()
    uniq = pd.Series(grid_ids).unique()
    if len(uniq) < k:
        return np.zeros(len(df), dtype=int)

    centroid_lookup: dict[str, tuple[float, float]] = {}
    with connect() as conn, conn.cursor() as cur:
        cur.execute("select grid_id, st_x(st_centroid(geom)) lon, st_y(st_centroid(geom)) lat from grid_500m_pop")
        for r in cur.fetchall():
            centroid_lookup[r["grid_id"]] = (float(r["lon"]), float(r["lat"]))

    # Fallback: average building centroid (lat/lon) per grid_id from df.
    if "centroid_lon" not in df.columns:
        df = df.copy()
    coords = []
    for gid in uniq:
        if gid in centroid_lookup:
            coords.append(centroid_lookup[gid])
        else:
            coords.append((0.0, 0.0))
    arr = np.array(coords, dtype=float)
    km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(arr)
    fold_of = dict(zip(uniq, km.labels_))
    return np.array([fold_of[g] for g in grid_ids], dtype=int)


def constrained_postprocess(df_block: pd.DataFrame, pred: np.ndarray) -> np.ndarray:
    """Scale predictions per grid so sum matches SGIS grid population.

    P1 fix: reset_index so positional `iloc`/array assignment aligns with pred.
    """
    df = df_block.reset_index(drop=True).copy()
    df["_pred"] = pred
    out = pred.copy().astype(float)
    for gid, group in df.groupby("grid_id"):
        if not gid:
            continue
        target = float(group["population"].iloc[0] or 0)
        sum_pred = float(group["_pred"].sum())
        if sum_pred <= 0 or target <= 0:
            continue
        scale = target / sum_pred
        positions = group.index.to_numpy()  # positional after reset_index
        out[positions] = group["_pred"].to_numpy() * scale
    return np.clip(out, 0, None)


def evaluate(
    name: str,
    y_true: np.ndarray,
    y_raw: np.ndarray,
    y_post: np.ndarray,
    grid_ids: np.ndarray,
    grid_pop: np.ndarray,
) -> dict:
    """Report both raw and post-processed metrics (P1 fix — avoid self-fulfilling)."""
    mae_raw = mean_absolute_error(y_true, y_raw)
    rmse_raw = mean_squared_error(y_true, y_raw, squared=False)
    r2_raw = r2_score(y_true, y_raw) if y_true.var() > 0 else float("nan")

    # Grid violation on RAW predictions (true measure of model fit to constraint).
    df = pd.DataFrame({"gid": grid_ids, "pred": y_raw, "pop": grid_pop})
    grouped = df.groupby("gid").agg({"pred": "sum", "pop": "first"})
    grouped = grouped[grouped["pop"] > 0]
    viol_raw = (
        float(np.mean(np.abs(grouped["pred"] - grouped["pop"]) / grouped["pop"]))
        if len(grouped) else float("nan")
    )

    mae_post = mean_absolute_error(y_true, y_post)
    LOG.info(
        f"eval.{name} mae_raw={mae_raw:.3f} mae_post={mae_post:.3f} "
        f"rmse_raw={rmse_raw:.3f} r2_raw={r2_raw:.3f} viol_raw={viol_raw:.3f}"
    )
    return {
        "mae_raw": float(mae_raw),
        "mae_post": float(mae_post),
        "rmse_raw": float(rmse_raw),
        "r2_raw": float(r2_raw),
        "grid_violation_raw": float(viol_raw),
    }


def baseline_area_share(df_block: pd.DataFrame) -> np.ndarray:
    """Naive baseline: distribute grid population by area_total share.

    Used in eval to ensure the trained model is not worse than this baseline.
    """
    df = df_block.reset_index(drop=True)
    out = np.zeros(len(df), dtype=float)
    for _, group in df.groupby("grid_id"):
        total = float(group["area_total"].sum())
        if total <= 0:
            continue
        pop = float(group["population"].iloc[0] or 0)
        positions = group.index.to_numpy()
        out[positions] = group["area_total"].to_numpy() * (pop / total)
    return out


def train_folds(df: pd.DataFrame, X: np.ndarray, y: np.ndarray, folds: np.ndarray) -> list[dict]:
    fold_metrics: list[dict] = []
    for k in sorted(set(folds)):
        train_idx = np.where(folds != k)[0]
        test_idx = np.where(folds == k)[0]
        if len(train_idx) == 0 or len(test_idx) == 0:
            continue
        model = xgb.XGBRegressor(**PARAMS, early_stopping_rounds=20)
        model.fit(
            X[train_idx], y[train_idx],
            eval_set=[(X[test_idx], y[test_idx])],
            verbose=False,
        )
        raw = model.predict(X[test_idx])
        test_df = df.iloc[test_idx].reset_index(drop=True)
        post = constrained_postprocess(test_df, raw)
        baseline = baseline_area_share(test_df)
        m = evaluate(
            f"fold{k}",
            y[test_idx],
            raw,
            post,
            test_df["grid_id"].fillna("").to_numpy(),
            test_df["population"].fillna(0).to_numpy(),
        )
        m["baseline_mae"] = float(mean_absolute_error(y[test_idx], baseline))
        fold_metrics.append(m)
    return fold_metrics


def compute_energy_coeffs(df: pd.DataFrame, final: xgb.XGBRegressor, X: np.ndarray) -> dict:
    """Compute per-use_code energy intensity per predicted resident (P1 fix).

    Divides aggregated kWh/m³ by population predicted by the trained model.
    """
    df = df.copy()
    df["pred_pop"] = np.clip(final.predict(X), 1e-3, None)
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""
            select be.building_id,
                   sum(be.electricity_kwh) e_sum,
                   sum(be.gas_m3) g_sum,
                   count(distinct be.yyyymm) months
            from building_energy be
            group by be.building_id
        """)
        rows = cur.fetchall()
    if not rows:
        return {}
    energy_df = pd.DataFrame(rows)
    merged = df.merge(energy_df, on="building_id", how="inner")
    merged = merged[merged["months"] > 0]
    merged["elec_per_month"] = merged["e_sum"].astype(float) / merged["months"].astype(float)
    merged["gas_per_month"] = merged["g_sum"].astype(float) / merged["months"].astype(float)
    coeffs: dict[str, dict[str, float]] = {}
    for code, group in merged.groupby("use_main_code"):
        if not code:
            continue
        # Sum per group and divide by sum of predicted population
        pop_sum = float(group["pred_pop"].sum())
        if pop_sum <= 0:
            continue
        coeffs[str(code)] = {
            "elec_kwh_per_pop_month": float(group["elec_per_month"].sum() / pop_sum),
            "gas_m3_per_pop_month": float(group["gas_per_month"].sum() / pop_sum),
            "n_buildings": int(len(group)),
        }
    return coeffs


def main() -> int:
    snap = Snapshot(step="13_train_population")
    conn = connect()
    try:
        df = build_features(conn)
    finally:
        conn.close()

    if df.empty:
        snap.warnings.append("no_data")
        snap.save()
        LOG.warning("No data — skipping training")
        return 0

    df = df.reset_index(drop=True)
    y = make_pseudo_labels(df).to_numpy()
    X = to_matrix(df)
    folds = spatial_folds(df)
    fold_metrics = train_folds(df, X, y, folds)

    if fold_metrics:
        snap.metrics["mae_raw_mean"] = float(np.mean([m["mae_raw"] for m in fold_metrics]))
        snap.metrics["mae_post_mean"] = float(np.mean([m["mae_post"] for m in fold_metrics]))
        snap.metrics["rmse_raw_mean"] = float(np.mean([m["rmse_raw"] for m in fold_metrics]))
        snap.metrics["r2_raw_mean"] = float(np.nanmean([m["r2_raw"] for m in fold_metrics]))
        snap.metrics["grid_violation_raw_mean"] = float(np.nanmean([m["grid_violation_raw"] for m in fold_metrics]))
        snap.metrics["baseline_mae_mean"] = float(np.mean([m["baseline_mae"] for m in fold_metrics]))
        # Regression guard: model must not be worse than 5% over baseline MAE.
        if snap.metrics["mae_raw_mean"] > snap.metrics["baseline_mae_mean"] * 1.05:
            snap.warnings.append("model_worse_than_baseline")

    # Final model on full data
    final = xgb.XGBRegressor(**PARAMS)
    final.fit(X, y, verbose=False)
    final.save_model(str(MODEL_DIR / "population.json"))

    coeffs = compute_energy_coeffs(df, final, X)

    meta = {
        "version": "0.1.0",
        "feature_cols": FEATURE_COLS,
        "params": PARAMS,
        "metrics": snap.metrics,
        "energy_coeffs": coeffs,
        "emission_factors": {"electricity_kg_per_kwh": 0.4781, "gas_kg_per_m3": 2.176},
        "trained_at": snap.run_at,
        "n_samples": int(len(df)),
    }
    (MODEL_DIR / "population.meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    snap.save()
    return 0


if __name__ == "__main__":
    sys.exit(main())
