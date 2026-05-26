-- 0006_population_grid_100m.sql — replace SGIS API-fetched grid with
-- KOSIS 100m 격자 (통계청 다사 GRID, GRID_CD anchor).
-- Source file: data/9_인구밀도/extracted/grid/grid_다사_100M.{shp,csv}.

create table if not exists grid_pop_100m (
  grid_cd        varchar(20) primary key,    -- 통계청 다사 GRID 코드
  year           smallint not null default 2024,
  geom           geometry(Polygon, 4326) not null,
  population     integer not null default 0,
  population_0_14   integer,
  population_15_64  integer,
  population_65_up  integer,
  source         text not null default 'kosis_2024_dasa',
  loaded_at      timestamptz not null default now()
);
create index if not exists grid_pop_100m_geom_gix on grid_pop_100m using gist (geom);
create index if not exists grid_pop_100m_pop_idx on grid_pop_100m (population);

-- Deprecate the SGIS-API table without dropping (kept for backward compat / docs)
comment on table grid_500m_pop is 'DEPRECATED — replaced by grid_pop_100m (ADR-0004 update). Safe to drop after migration confirmed.';

-- RLS: same anon read-only policy
alter table grid_pop_100m enable row level security;
drop policy if exists anon_read on grid_pop_100m;
create policy anon_read on grid_pop_100m for select to anon using (true);
create policy authenticated_read on grid_pop_100m for select to authenticated using (true);
