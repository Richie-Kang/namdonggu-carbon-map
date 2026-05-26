import { create } from 'zustand';

export type SelectedBuilding = {
  building_id: string;
  pnu?: string | null;
  name?: string | null;
  use_main?: string | null;
  use_main_code?: string | null;
  co2_kg_month?: number | null;
  co2_quintile?: number | null;
  area_total?: number | null;
} | null;

type SimInputs = { use_main_code: string; land_use_category: string; pop_delta_pct: number };

type State = {
  selected: SelectedBuilding;
  panelTab: 'data' | 'simulation';
  simInputs: SimInputs;
  simDefaultsKey: string | null;        // last building_id we synced defaults from
  colorScheme: 'jet' | 'viridis';
  showBuildings: boolean;
  showGrid: boolean;
  showBoundary: boolean;
  showRoads: boolean;
};

type Actions = {
  setSelected: (b: SelectedBuilding) => void;
  setPanelTab: (t: State['panelTab']) => void;
  setSim: (k: keyof SimInputs, v: string | number) => void;
  resetSim: (defaults: Partial<SimInputs>, buildingKey: string) => void;
  setColorScheme: (s: State['colorScheme']) => void;
  toggleLayer: (k: 'showBuildings' | 'showGrid' | 'showBoundary' | 'showRoads') => void;
};

export const useAppStore = create<State & Actions>((set) => ({
  selected: null,
  panelTab: 'data',
  simInputs: { use_main_code: '', land_use_category: 'other', pop_delta_pct: 0 },
  simDefaultsKey: null,
  colorScheme: 'jet',
  showBuildings: true,
  showGrid: true,
  showBoundary: true,
  // reason: OSM basemap already shows streets — our overlay road lines were
  // redundant noise on the user-supplied reference map. Default to off.
  showRoads: false,
  setSelected: (b) => set({ selected: b, panelTab: 'data' }),
  setPanelTab: (t) => set({ panelTab: t }),
  setSim: (k, v) =>
    set((state) => ({ simInputs: { ...state.simInputs, [k]: v } as SimInputs })),
  resetSim: (defaults, buildingKey) =>
    set((state) => ({
      simInputs: { ...state.simInputs, ...defaults } as SimInputs,
      simDefaultsKey: buildingKey,
    })),
  setColorScheme: (s) => set({ colorScheme: s }),
  toggleLayer: (k) => set((state) => ({ [k]: !state[k] } as Partial<State>)),
}));
