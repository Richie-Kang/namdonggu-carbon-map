-- 0002_indices.sql — spatial + attribute indexes
create index if not exists parcels_geom_gix on parcels using gist (geom);
create index if not exists buildings_geom_gix on buildings using gist (geom);
create index if not exists buildings_centroid_gix on buildings using gist (centroid);
create index if not exists buildings_pnu_idx on buildings (pnu);
create index if not exists buildings_use_code_idx on buildings (use_main_code);
create index if not exists buildings_co2_idx on buildings (co2_kg_month);
create index if not exists buildings_co2_quintile_idx on buildings (co2_quintile);

create index if not exists energy_pnu_idx on energy_monthly (pnu);
create index if not exists energy_yyyymm_idx on energy_monthly (yyyymm);

create index if not exists building_energy_yyyymm_idx on building_energy (yyyymm);

create index if not exists businesses_geom_gix on businesses using gist (geom);
create index if not exists businesses_pnu_idx on businesses (pnu);
create index if not exists businesses_industry_idx on businesses (industry_code);

create index if not exists factories_geom_gix on factories using gist (geom);
create index if not exists factories_pnu_idx on factories (pnu);

create index if not exists grid_100m_geom_gix on grid_100m using gist (geom);
create index if not exists grid_100m_co2_idx on grid_100m (co2_kg_month);
create index if not exists grid_500m_pop_geom_gix on grid_500m_pop using gist (geom);

-- Cluster buildings physically on centroid for spatially local queries.
-- reason: bbox queries dominate; physical locality avoids random IO.
cluster buildings using buildings_centroid_gix;
