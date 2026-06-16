-- Monthly CO2 helpers for building-level map filtering.
-- get_monthly_quintiles computes per-month quintiles from building_energy,
-- while get_available_months exposes the selectable month list.

create or replace function get_monthly_quintiles(p_yyyymm char(6))
returns table(building_id varchar, co2_quintile int)
language sql
security invoker
stable
set search_path = public
as $$
  select
    building_id,
    ntile(5) over (order by co2_kg)::int as co2_quintile
  from building_energy
  where yyyymm = p_yyyymm
    and co2_kg is not null
    and co2_kg > 0;
$$;

create or replace function get_available_months()
returns table(yyyymm char(6))
language sql
security invoker
stable
set search_path = public
as $$
  select distinct yyyymm
  from building_energy
  order by yyyymm desc;
$$;

grant execute on function get_monthly_quintiles(char) to anon, authenticated;
grant execute on function get_available_months() to anon, authenticated;
