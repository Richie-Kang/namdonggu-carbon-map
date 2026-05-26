"""ai/features.py — feature engineering for population disaggregation."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import psycopg

FEATURE_COLS = [
    "area_total",
    "floors_above",
    "floors_below",
    "height_m",
    "approved_year",
    "use_main_code_int",
    "land_use_residential",
    "land_use_commercial",
    "land_use_industrial",
    "business_density_50m",
    "factory_within_100m",
]


def build_features(conn: psycopg.Connection) -> pd.DataFrame:
    """Materialize per-building feature frame.
    Joins buildings + parcels.jimok + nearby business count + factory flag + grid pop.
    Returns DataFrame with FEATURE_COLS + (grid_id, area_total, residential_flag).
    """
    with conn.cursor() as cur:
        cur.execute("""
            with bd as (
                select b.building_id,
                       b.pnu,
                       coalesce(b.area_total, 0)::float as area_total,
                       coalesce(b.floors_above, 0)::int as floors_above,
                       coalesce(b.floors_below, 0)::int as floors_below,
                       coalesce(b.height_m, 0)::float as height_m,
                       coalesce(extract(year from b.approved_at), 1990)::int as approved_year,
                       b.use_main_code,
                       b.centroid
                from buildings b
            ),
            lu as (
                select bd.building_id,
                       coalesce(l.category, 'other') as category
                from bd
                left join land_use_lookup l on l.code = bd.use_main_code
            ),
            biz as (
                select bd.building_id,
                       count(b2.shop_id) filter (where st_dwithin(b2.geom::geography, bd.centroid::geography, 50)) as biz_50m
                from bd
                left join businesses b2 on b2.geom && st_expand(bd.centroid, 0.001)
                group by bd.building_id
            ),
            fac as (
                select bd.building_id,
                       count(f.factory_id) filter (where f.geom is not null and st_dwithin(f.geom::geography, bd.centroid::geography, 100)) > 0 as has_fac
                from bd
                left join factories f on f.geom && st_expand(bd.centroid, 0.002)
                group by bd.building_id
            ),
            grid as (
                select bd.building_id, g.grid_id, g.population
                from bd
                left join grid_500m_pop g on st_intersects(g.geom, bd.centroid)
            )
            select bd.*, lu.category, biz.biz_50m, fac.has_fac, grid.grid_id, grid.population
            from bd
            join lu on lu.building_id = bd.building_id
            left join biz on biz.building_id = bd.building_id
            left join fac on fac.building_id = bd.building_id
            left join grid on grid.building_id = bd.building_id;
        """)
        rows = cur.fetchall()
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["use_main_code_int"] = pd.to_numeric(df["use_main_code"], errors="coerce").fillna(0).astype(int)
    df["land_use_residential"] = (df["category"] == "residential").astype(int)
    df["land_use_commercial"] = (df["category"] == "commercial").astype(int)
    df["land_use_industrial"] = (df["category"] == "industrial").astype(int)
    df["business_density_50m"] = df["biz_50m"].fillna(0).astype(int)
    df["factory_within_100m"] = df["has_fac"].fillna(False).astype(int)
    df["residential_flag"] = df["land_use_residential"].astype(int)
    return df


def to_matrix(df: pd.DataFrame) -> np.ndarray:
    return df[FEATURE_COLS].astype(np.float32).to_numpy()


@dataclass
class GridLabels:
    grid_id: str
    population: float
    building_ids: list[str]
    areas: list[float]


def make_pseudo_labels(df: pd.DataFrame) -> pd.Series:
    """Pseudo per-building population from 500m grid total × residential area share.
    reason: dasymetric — non-residential gets ~0 contribution unless adjusted later.
    """
    residential_weight = df["residential_flag"].astype(float).where(
        df["residential_flag"] == 1, 0.05
    )
    weighted_area = df["area_total"].astype(float) * residential_weight
    grid_sum = df.groupby("grid_id")["area_total"].transform(
        lambda x: (x * residential_weight.loc[x.index]).sum()
    )
    grid_pop = df.groupby("grid_id")["population"].transform("first").fillna(0).astype(float)
    share = weighted_area / grid_sum.replace(0, np.nan)
    labels = grid_pop * share
    return labels.fillna(0.0)
