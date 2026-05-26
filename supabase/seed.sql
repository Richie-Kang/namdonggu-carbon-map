-- seed.sql — reference data (no spatial data here)
insert into emission_factors (source, factor, unit, reference, effective_from)
values
  ('electricity', 0.4781, 'kgCO2eq/kWh', 'KEEI 2023 전력 배출계수', '2023-01-01'),
  ('gas_lng',     2.176,  'kgCO2eq/m3',  '온실가스종합정보센터 LNG 배출계수', '2023-01-01')
on conflict (source) do update
  set factor = excluded.factor,
      unit = excluded.unit,
      reference = excluded.reference,
      effective_from = excluded.effective_from;

insert into land_use_lookup (code, ko_name, category) values
  ('01000', '단독주택',     'residential'),
  ('01100', '다중주택',     'residential'),
  ('02000', '공동주택',     'residential'),
  ('02100', '아파트',       'residential'),
  ('02200', '연립주택',     'residential'),
  ('02300', '다세대주택',   'residential'),
  ('03000', '1종근린생활시설', 'commercial'),
  ('04000', '2종근린생활시설', 'commercial'),
  ('05000', '문화및집회시설',   'public'),
  ('07000', '판매시설',         'commercial'),
  ('08000', '운수시설',         'public'),
  ('09000', '의료시설',         'public'),
  ('10000', '교육연구시설',     'public'),
  ('14000', '업무시설',         'commercial'),
  ('15000', '숙박시설',         'commercial'),
  ('17000', '공장',             'industrial'),
  ('18000', '창고시설',         'industrial')
on conflict (code) do update
  set ko_name = excluded.ko_name,
      category = excluded.category;
