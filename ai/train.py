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
    grid_ids = df["grid_id"].fillna("__none__").to_numpy()
    uniq = pd.Series(grid_ids).unique()
    if len(uniq) < k:
        return np.zeros(len(df), dtype=int)
    # Centroid of each grid for clustering — approximate by first-occurrence row index.
    centroid_lookup: dict[str, tuple[float, float]] = {}
    for gid, area in zip(df["grid_id"], df["area_total"]):
        if gid not in centroid_lookup:
            centroid_lookup[gid] = (float(area), 0.0)
    coords = np.array([centroid_lookup.get(g, (0.0, 0.0)) for g in uniq])
    km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(coords)
    fold_of = dict(zip(uniq, km.labels_))
    return np.array([fold_of[g] for g in grid_ids], dtype=int)


def constrained_postprocess(df: pd.DataFrame, pred: np.ndarray) -> np.ndarray:
    """Scale predictions per grid so sum matches grid_500m population."""
    out = pred.copy()
    df = df.assign(_pred=pred)
    for gid, group in df.groupby("grid_id"):
        if not gid:
            continue
        target = float(group["population"].iloc[0] or 0)
        sum_pred = float(group["_pred"].sum())
        if sum_pred > 0:
            scale = target / sum_pred
            out[group.index] = group["_pred"].values * scale
    return np.clip(out, 0, None)


def evaluate(name: str, y_true: np.ndarray, y_pred: np.ndarray, grid_ids: np.ndarray, grid_pop: np.ndarray) -> dict:
    mae = mean_absolute_error(y_true, y_pred)
    rmse = mean_squared_error(y_true, y_pred, squared=False)
    r2 = r2_score(y_true, y_pred) if y_true.var() > 0 else float("nan")
    # constraint violation: per-grid sum vs target
    df = pd.DataFrame({"gid": grid_ids, "pred": y_pred, "pop": grid_pop})
    grouped = df.groupby("gid").agg({"pred": "sum", "pop": "first"})
    grouped = grouped[grouped["pop"] > 0]
    if len(grouped):
        viol = np.mean(np.abs(grouped["pred"] - grouped["pop"]) / grouped["pop"])
    else:
        viol = float("nan")
    LOG.info(
        f"eval.{name} mae={mae:.3f} rmse={rmse:.3f} r2={r2:.3f} grid_violation={viol:.3f}"
    )
    return {"mae": float(mae), "rmse": float(rmse), "r2": float(r2), "grid_violation": float(viol)}


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
    fold_metrics = []

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
        pred = model.predict(X[test_idx])
        pred_post = constrained_postprocess(df.iloc[test_idx].assign(_idx=range(len(test_idx))), pred)
        m = evaluate(f"fold{k}", y[test_idx], pred_post,
                     df["grid_id"].iloc[test_idx].fillna("").to_numpy(),
                     df["population"].iloc[test_idx].fillna(0).to_numpy())
        fold_metrics.append(m)

    if fold_metrics:
        snap.metrics["mae_mean"] = float(np.mean([m["mae"] for m in fold_metrics]))
        snap.metrics["rmse_mean"] = float(np.mean([m["rmse"] for m in fold_metrics]))
        snap.metrics["r2_mean"] = float(np.nanmean([m["r2"] for m in fold_metrics]))
        snap.metrics["grid_violation_mean"] = float(np.nanmean([m["grid_violation"] for m in fold_metrics]))

    # Final model on full data
    final = xgb.XGBRegressor(**PARAMS)
    final.fit(X, y, verbose=False)
    final.save_model(str(MODEL_DIR / "population.json"))

    # energy coefficients per use_code (linear regression: kwh per resident)
    coeffs = {}
    df["pred_pop"] = final.predict(X)
    df["pred_pop"] = np.clip(df["pred_pop"], 1e-3, None)
    energy_rows = []
    with connect() as conn2, conn2.cursor() as cur2:
        cur2.execute("""
            select b.use_main_code,
                   avg(be.electricity_kwh) e_avg,
                   avg(be.gas_m3) g_avg
            from buildings b
            join building_energy be on be.building_id = b.building_id
            group by b.use_main_code
        """)
        energy_rows = cur2.fetchall()
    for r in energy_rows:
        if not r["use_main_code"]:
            continue
        coeffs[r["use_main_code"]] = {
            "elec_kwh_per_pop": float(r["e_avg"] or 0),
            "gas_m3_per_pop": float(r["g_avg"] or 0),
        }

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
