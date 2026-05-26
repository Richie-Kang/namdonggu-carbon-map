-- 0001_init.sql — schema
create extension if not exists postgis;

-- 지번 폴리곤
create table if not exists parcels (
  pnu            varchar(19) primary key,
  jibun          text,
  address_jibun  text,
  address_road   text,
  jimok          text,
  geom           geometry(MultiPolygon, 4326) not null
);

-- 건물 폴리곤
create table if not exists buildings (
  building_id    varchar(40) primary key,
  pnu            varchar(19) references parcels(pnu) on delete set null,
  name           text,
  use_main       text,
  use_main_code  varchar(10),
  floors_above   smallint,
  floors_below   smallint,
  area_building  numeric,
  area_total     numeric,
  height_m       numeric,
  approved_at    date,
  geom           geometry(MultiPolygon, 4326) not null,
  centroid       geometry(Point, 4326)
    generated always as (st_centroid(geom)) stored,
  co2_kg_month   numeric,
  co2_quintile   smallint check (co2_quintile between 1 and 5),
  population_pred numeric
);

-- 지번 단위 월별 에너지 (원본)
create table if not exists energy_monthly (
  pnu            varchar(19) references parcels(pnu) on delete cascade,
  yyyymm         char(6) not null,
  electricity_kwh numeric not null default 0,
  gas_m3         numeric not null default 0,
  source         text not null default 'raw',
  primary key (pnu, yyyymm),
  constraint energy_yyyymm_format check (yyyymm ~ '^\d{6}$'),
  constraint energy_nonneg check (electricity_kwh >= 0 and gas_m3 >= 0)
);

-- 건물 단위 월별 (안분)
create table if not exists building_energy (
  building_id     varchar(40) references buildings(building_id) on delete cascade,
  yyyymm          char(6) not null,
  electricity_kwh numeric not null default 0,
  gas_m3          numeric not null default 0,
  co2_kg          numeric not null default 0,
  source          text not null default 'proportional',
  primary key (building_id, yyyymm)
);

create table if not exists businesses (
  shop_id        text primary key,
  name           text,
  industry_code  varchar(20),
  industry_name  text,
  pnu            varchar(19),
  building_id    varchar(40),
  geom           geometry(Point, 4326)
);

create table if not exists factories (
  factory_id     text primary key,
  name           text,
  industry_code  varchar(20),
  industry_name  text,
  employees      int,
  address_jibun  text,
  pnu            varchar(19),
  building_id    varchar(40),
  geom           geometry(Point, 4326)
);

create table if not exists grid_100m (
  grid_id          varchar(24) primary key,
  geom             geometry(Polygon, 4326) not null,
  co2_kg_month     numeric not null default 0,
  co2_quintile     smallint check (co2_quintile between 1 and 5),
  population_pred  numeric,
  building_count   integer not null default 0
);

create table if not exists grid_500m_pop (
  grid_id        varchar(24) primary key,
  geom           geometry(Polygon, 4326) not null,
  population     integer not null,
  source         text not null default 'sgis',
  fetched_at     timestamptz not null default now()
);

create table if not exists emission_factors (
  source         varchar(20) primary key,
  factor         numeric not null,
  unit           text not null,
  reference      text,
  effective_from date not null
);

create table if not exists land_use_lookup (
  code           varchar(10) primary key,
  ko_name        text not null,
  category       text not null check (category in ('residential','commercial','industrial','public','other'))
);

-- snapshot table for ETL runs
create table if not exists etl_snapshots (
  id             bigserial primary key,
  step           text not null,
  run_at         timestamptz not null default now(),
  counts         jsonb not null default '{}'::jsonb,
  metrics        jsonb not null default '{}'::jsonb,
  warnings       jsonb not null default '[]'::jsonb
);

comment on table parcels is '연속지적도 (지번 폴리곤), EPSG:4326';
comment on table buildings is 'GIS건물통합정보 + 건축물대장 매칭, EPSG:4326';
comment on table energy_monthly is '지번·월 단위 전기/가스 사용량 원본';
comment on table building_energy is '연면적 비율로 안분된 건물·월 단위 사용량 + CO2';
comment on table grid_100m is '100m 격자 hotspot. cell_id = X_Y from origin';
comment on table grid_500m_pop is 'SGIS 500m 격자 상주인구';
