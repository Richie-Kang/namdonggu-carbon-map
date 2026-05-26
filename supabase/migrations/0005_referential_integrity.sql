-- 0005_referential_integrity.sql — add deferred FKs on attribute tables (P2).
-- businesses/factories are loaded BEFORE matching, so pnu/building_id may be
-- NULL at insert time. Use ON DELETE SET NULL so deletes don't cascade
-- through long-lived attribute rows.

alter table businesses
  drop constraint if exists businesses_pnu_fkey,
  drop constraint if exists businesses_building_id_fkey;
alter table businesses
  add constraint businesses_pnu_fkey
    foreign key (pnu) references parcels(pnu) on delete set null
    deferrable initially deferred,
  add constraint businesses_building_id_fkey
    foreign key (building_id) references buildings(building_id) on delete set null
    deferrable initially deferred;

alter table factories
  drop constraint if exists factories_pnu_fkey,
  drop constraint if exists factories_building_id_fkey;
alter table factories
  add constraint factories_pnu_fkey
    foreign key (pnu) references parcels(pnu) on delete set null
    deferrable initially deferred,
  add constraint factories_building_id_fkey
    foreign key (building_id) references buildings(building_id) on delete set null
    deferrable initially deferred;

-- P2 fix: grid_100m default co2=0 made `is null` delete dead code.
-- Surface the cleanup as a view-level concern: keep cells, just hide
-- pure-zero hotspots from API by quintile filter at query time. No DML
-- here — see etl/06_make_grid.py for the corrected delete.

-- Anon RLS coverage for newly altered tables stays the same (read-only).
