-- 0003_rpc.sql — read-only RPCs
-- All RPCs SET LOCAL statement_timeout to limit DoS via slow queries (ADR-0018).

create or replace function get_building_detail(p_building_id varchar)
returns jsonb
language plpgsql
security invoker
stable
as $$
declare
  v_building jsonb;
  v_energy   jsonb;
  v_business jsonb;
  v_factory  jsonb;
  v_recent   record;
begin
  set local statement_timeout = '3s';

  if p_building_id !~ '^[A-Za-z0-9_-]{1,40}$' then
    raise exception 'invalid building_id format';
  end if;

  select to_jsonb(b) - 'geom' - 'centroid'
    || jsonb_build_object(
      'centroid_lon', st_x(b.centroid),
      'centroid_lat', st_y(b.centroid)
    )
  into v_building
  from buildings b
  where b.building_id = p_building_id;

  if v_building is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select jsonb_agg(jsonb_build_object(
    'yyyymm', yyyymm,
    'electricity_kwh', electricity_kwh,
    'gas_m3', gas_m3,
    'co2_kg', co2_kg
  ) order by yyyymm desc)
  into v_energy
  from (
    select * from building_energy
    where building_id = p_building_id
    order by yyyymm desc
    limit 12
  ) t;

  select jsonb_agg(jsonb_build_object(
    'shop_id', shop_id,
    'name', name,
    'industry_code', industry_code,
    'industry_name', industry_name
  ))
  into v_business
  from businesses
  where building_id = p_building_id
  limit 20;

  select jsonb_agg(jsonb_build_object(
    'factory_id', factory_id,
    'name', name,
    'industry_code', industry_code,
    'industry_name', industry_name,
    'employees', employees
  ))
  into v_factory
  from factories
  where building_id = p_building_id
  limit 20;

  return jsonb_build_object(
    'building', v_building,
    'energy',   coalesce(v_energy,   '[]'::jsonb),
    'businesses', coalesce(v_business, '[]'::jsonb),
    'factories',  coalesce(v_factory,  '[]'::jsonb)
  );
end;
$$;

create or replace function get_buildings_bbox(
  p_west numeric, p_south numeric, p_east numeric, p_north numeric
) returns setof jsonb
language plpgsql
security invoker
stable
as $$
begin
  set local statement_timeout = '3s';

  if (p_east - p_west) > 0.5 or (p_north - p_south) > 0.5 then
    raise exception 'bbox too wide';
  end if;
  if p_west >= p_east or p_south >= p_north then
    raise exception 'invalid bbox order';
  end if;

  return query
  select jsonb_build_object(
    'type', 'Feature',
    'id', b.building_id,
    'geometry', st_asgeojson(b.geom)::jsonb,
    'properties', jsonb_build_object(
      'building_id', b.building_id,
      'pnu', b.pnu,
      'name', b.name,
      'use_main', b.use_main,
      'co2_kg_month', b.co2_kg_month,
      'co2_quintile', b.co2_quintile
    )
  )
  from buildings b
  where b.geom && st_makeenvelope(p_west, p_south, p_east, p_north, 4326)
  limit 30000;
end;
$$;

create or replace function get_grid_bbox(
  p_west numeric, p_south numeric, p_east numeric, p_north numeric
) returns setof jsonb
language plpgsql
security invoker
stable
as $$
begin
  set local statement_timeout = '3s';

  if (p_east - p_west) > 0.5 or (p_north - p_south) > 0.5 then
    raise exception 'bbox too wide';
  end if;

  return query
  select jsonb_build_object(
    'type', 'Feature',
    'id', g.grid_id,
    'geometry', st_asgeojson(g.geom)::jsonb,
    'properties', jsonb_build_object(
      'grid_id', g.grid_id,
      'co2_kg_month', g.co2_kg_month,
      'co2_quintile', g.co2_quintile,
      'population_pred', g.population_pred,
      'building_count', g.building_count
    )
  )
  from grid_100m g
  where g.geom && st_makeenvelope(p_west, p_south, p_east, p_north, 4326);
end;
$$;

create or replace function top_buildings_in_grid(p_grid_id varchar)
returns setof jsonb
language plpgsql
security invoker
stable
as $$
begin
  set local statement_timeout = '2s';

  return query
  select jsonb_build_object(
    'building_id', b.building_id,
    'name', b.name,
    'use_main', b.use_main,
    'co2_kg_month', b.co2_kg_month
  )
  from grid_100m g
  join buildings b
    on st_intersects(b.centroid, g.geom)
  where g.grid_id = p_grid_id
  order by b.co2_kg_month desc nulls last
  limit 5;
end;
$$;
