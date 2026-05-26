-- 0004_rls.sql — Row Level Security (read-only anon, ADR-0009 + ADR-0018)

alter table parcels          enable row level security;
alter table buildings        enable row level security;
alter table energy_monthly   enable row level security;
alter table building_energy  enable row level security;
alter table businesses       enable row level security;
alter table factories        enable row level security;
alter table grid_100m        enable row level security;
alter table grid_500m_pop    enable row level security;
alter table emission_factors enable row level security;
alter table land_use_lookup  enable row level security;
alter table etl_snapshots    enable row level security;

-- anon read for all tables (no write policies → INSERT/UPDATE/DELETE denied)
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'parcels','buildings','energy_monthly','building_energy',
      'businesses','factories','grid_100m','grid_500m_pop',
      'emission_factors','land_use_lookup'
    ])
  loop
    execute format('drop policy if exists anon_read on %I', t);
    execute format('create policy anon_read on %I for select to anon using (true)', t);
    execute format('create policy authenticated_read on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- etl_snapshots: only service_role writes (default), anon read denied except metadata count
-- (no policy created → effectively forbidden)
revoke select on etl_snapshots from anon, authenticated;

-- harden roles
revoke create on schema public from anon, authenticated;
revoke usage on schema pg_catalog from anon, authenticated;

-- statement_timeout per role (ADR-0018)
alter role anon set statement_timeout = '5s';
alter role authenticated set statement_timeout = '10s';
