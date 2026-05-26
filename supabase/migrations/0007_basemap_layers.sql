-- 0007_basemap_layers.sql — 행정경계 + 도로 + 토지이용 zone (시각화 보조).

create table if not exists admin_boundary (
  ufid       varchar(50) primary key,
  code       varchar(12) not null,     -- BJCD
  name       text not null,
  level      text not null check (level in ('sido','sigungu','dong')),
  geom       geometry(MultiPolygon, 4326) not null
);
create index if not exists admin_boundary_gix on admin_boundary using gist (geom);
create index if not exists admin_boundary_lvl_idx on admin_boundary (level);

create table if not exists roads (
  road_id    bigserial primary key,
  road_class text,
  geom       geometry(LineString, 4326) not null
);
create index if not exists roads_gix on roads using gist (geom);

create table if not exists industrial_zones (
  zone_id    text primary key,
  name       text,
  category   text,        -- 산업단지/도시지역/경제자유구역 etc.
  geom       geometry(MultiPolygon, 4326) not null
);
create index if not exists industrial_zones_gix on industrial_zones using gist (geom);

-- Building-level 용적률 column for later (ADR-0020 follow-up). 13_데이터는
-- 28185(연수구) 라 남동구 매칭 0건 — 컬럼만 미리 추가하고 NULL 유지.
alter table buildings add column if not exists floor_area_ratio numeric;

-- Grid-level land-use category (toggled later by ETL 10).
alter table grid_100m add column if not exists land_use_category text;

-- RLS
alter table admin_boundary enable row level security;
alter table roads enable row level security;
alter table industrial_zones enable row level security;
drop policy if exists anon_read on admin_boundary;
drop policy if exists anon_read on roads;
drop policy if exists anon_read on industrial_zones;
create policy anon_read on admin_boundary for select to anon using (true);
create policy anon_read on roads for select to anon using (true);
create policy anon_read on industrial_zones for select to anon using (true);
