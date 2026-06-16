/**
 * web/lib/themes.ts — 주제도 테마별 MapLibre paint/filter expression.
 * PMTiles 컬럼 기준:
 *   buildings: building_id, use_main(한국어), co2_kg_month, co2_quintile, population_pred
 *   grid:      grid_id, co2_kg_month, co2_quintile, population_pred, land_use_category
 */

import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import type { UsageUnit } from './simulation-utils';

export type ThemeMode = 'co2' | 'population' | 'land_use' | 'energy';
export type IndustryFilter = 'all' | 'residential' | 'commercial' | 'industrial' | 'public';

// use_main 한국어 → 카테고리 목록 (land_use_lookup seed 기준)
const RESIDENTIAL_NAMES = ['단독주택', '다중주택', '공동주택', '아파트', '연립주택', '다세대주택'];
const COMMERCIAL_NAMES = [
  '제1종근린생활시설', '제2종근린생활시설', '판매시설', '업무시설', '숙박시설',
];
const INDUSTRIAL_NAMES = ['공장', '창고시설'];
const PUBLIC_NAMES = ['문화및집회시설', '운수시설', '의료시설', '교육연구시설'];

export const THEME_META: Record<ThemeMode, { label: string; note?: string }> = {
  co2: { label: 'CO₂ 배출량' },
  population: { label: '인구 밀도', note: 'AI 추정 · 월 기준' },
  land_use: { label: '건물/토지 용도' },
  energy: {
    label: '에너지 사용량',
    note: '전기·가스 합산 CO₂ 기준',
  },
};

export const INDUSTRY_FILTER_META: Record<IndustryFilter, string> = {
  all: '전체',
  residential: '주거',
  commercial: '상업',
  industrial: '산업',
  public: '공공',
};

// ── buildings-fill paint expressions ──────────────────────────────────────────

const CO2_QUINTILE_COLOR: ExpressionSpecification = [
  'case',
  ['==', ['get', 'co2_quintile'], 1], '#16a34a',
  ['==', ['get', 'co2_quintile'], 2], '#84cc16',
  ['==', ['get', 'co2_quintile'], 3], '#eab308',
  ['==', ['get', 'co2_quintile'], 4], '#f97316',
  ['==', ['get', 'co2_quintile'], 5], '#dc2626',
  '#9ca3af',
];

const POPULATION_COLOR: ExpressionSpecification = [
  'step',
  ['get', 'population_pred'],
  '#eff6ff',
  5,  '#bfdbfe',
  20, '#60a5fa',
  50, '#2563eb',
  100, '#1e3a8a',
];

const LAND_USE_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'use_main'],
  RESIDENTIAL_NAMES, '#3b82f6',
  COMMERCIAL_NAMES,  '#f97316',
  INDUSTRIAL_NAMES,  '#8b5cf6',
  PUBLIC_NAMES,      '#10b981',
  '#9ca3af',
];

const ENERGY_COLOR: ExpressionSpecification = [
  'case',
  ['==', ['get', 'co2_quintile'], 1], '#fff7ed',
  ['==', ['get', 'co2_quintile'], 2], '#fed7aa',
  ['==', ['get', 'co2_quintile'], 3], '#fb923c',
  ['==', ['get', 'co2_quintile'], 4], '#ea580c',
  ['==', ['get', 'co2_quintile'], 5], '#7c2d12',
  '#9ca3af',
];

function co2FeatureStateColor(): ExpressionSpecification {
  return [
    'case',
    ['==', ['feature-state', 'co2_quintile_override'], 1], '#16a34a',
    ['==', ['feature-state', 'co2_quintile_override'], 2], '#84cc16',
    ['==', ['feature-state', 'co2_quintile_override'], 3], '#eab308',
    ['==', ['feature-state', 'co2_quintile_override'], 4], '#f97316',
    ['==', ['feature-state', 'co2_quintile_override'], 5], '#dc2626',
    CO2_QUINTILE_COLOR,
  ] as unknown as ExpressionSpecification;
}

export function buildingPaintExpr(theme: ThemeMode, period: UsageUnit = 'monthly'): ExpressionSpecification {
  switch (theme) {
    case 'population': return POPULATION_COLOR;
    case 'land_use':   return LAND_USE_COLOR;
    case 'energy':     return ENERGY_COLOR;
    default:           return co2FeatureStateColor();
  }
}

// ── grid-fill paint expressions ───────────────────────────────────────────────

const GRID_LAND_USE_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'land_use_category'],
  'residential', '#3b82f6',
  'commercial',  '#f97316',
  'industrial',  '#8b5cf6',
  'public',      '#10b981',
  '#9ca3af',
];

export function gridPaintExpr(theme: ThemeMode, period: UsageUnit = 'monthly'): ExpressionSpecification {
  switch (theme) {
    case 'population': return POPULATION_COLOR;
    case 'land_use':   return GRID_LAND_USE_COLOR;
    case 'energy':     return ENERGY_COLOR;
    default:           return CO2_QUINTILE_COLOR;
  }
}

// ── filter expressions ────────────────────────────────────────────────────────

export function buildingFilterExpr(filter: IndustryFilter): FilterSpecification {
  if (filter === 'all') return ['has', 'co2_quintile'];
  const names =
    filter === 'residential' ? RESIDENTIAL_NAMES :
    filter === 'commercial'  ? COMMERCIAL_NAMES  :
    filter === 'industrial'  ? INDUSTRIAL_NAMES  :
                               PUBLIC_NAMES;
  return ['in', ['get', 'use_main'], ['literal', names]];
}

export function gridFilterExpr(filter: IndustryFilter): FilterSpecification {
  if (filter === 'all') return ['has', 'co2_quintile'];
  const cat =
    filter === 'residential' ? 'residential' :
    filter === 'commercial'  ? 'commercial'  :
    filter === 'industrial'  ? 'industrial'  :
                               'public';
  return ['==', ['get', 'land_use_category'], cat];
}

// ── legend data ───────────────────────────────────────────────────────────────

export type LegendItem = { color: string; label: string };

const CO2_QUINTILE_LEGEND: LegendItem[] = [
  { color: '#16a34a', label: '하위 20%' },
  { color: '#84cc16', label: '20–40%' },
  { color: '#eab308', label: '40–60%' },
  { color: '#f97316', label: '60–80%' },
  { color: '#dc2626', label: '상위 20%' },
];

const POPULATION_LEGEND: LegendItem[] = [
  { color: '#eff6ff', label: '0–4명' },
  { color: '#bfdbfe', label: '5–19명' },
  { color: '#60a5fa', label: '20–49명' },
  { color: '#2563eb', label: '50–99명' },
  { color: '#1e3a8a', label: '100명+' },
];

const LAND_USE_LEGEND: LegendItem[] = [
  { color: '#3b82f6', label: '주거' },
  { color: '#f97316', label: '상업' },
  { color: '#8b5cf6', label: '산업' },
  { color: '#10b981', label: '공공' },
  { color: '#9ca3af', label: '기타' },
];

const ENERGY_LEGEND: LegendItem[] = [
  { color: '#fff7ed', label: '매우 낮음' },
  { color: '#fed7aa', label: '낮음' },
  { color: '#fb923c', label: '중간' },
  { color: '#ea580c', label: '높음' },
  { color: '#7c2d12', label: '매우 높음' },
];

export function legendItems(theme: ThemeMode, period: UsageUnit = 'monthly'): LegendItem[] {
  switch (theme) {
    case 'population': return POPULATION_LEGEND;
    case 'land_use':   return LAND_USE_LEGEND;
    case 'energy':     return ENERGY_LEGEND;
    default:           return CO2_QUINTILE_LEGEND;
  }
}

export function gridLegendItems(theme: ThemeMode): LegendItem[] {
  if (theme === 'co2') return CO2_QUINTILE_LEGEND;
  return legendItems(theme);
}

export function themeNote(theme: ThemeMode, period: UsageUnit = 'monthly'): string | undefined {
  if (theme === 'co2') return period === 'annual' ? '선택 연도 내 상대분포' : '선택 월 내 상대분포';
  return THEME_META[theme].note;
}
