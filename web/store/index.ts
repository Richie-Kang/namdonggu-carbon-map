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

type State = {
  selected: SelectedBuilding;
  simInputs: { use_main_code: string; land_use_category: string; pop_delta_pct: number };
  colorScheme: 'jet' | 'viridis';
  showBuildings: boolean;
  showGrid: boolean;
};

type Actions = {
  setSelected: (b: SelectedBuilding) => void;
  setSim: (k: keyof State['simInputs'], v: string | number) => void;
  setColorScheme: (s: State['colorScheme']) => void;
  toggleLayer: (k: 'showBuildings' | 'showGrid') => void;
};

export const useAppStore = create<State & Actions>((set) => ({
  selected: null,
  simInputs: { use_main_code: '', land_use_category: 'other', pop_delta_pct: 0 },
  colorScheme: 'jet',
  showBuildings: true,
  showGrid: true,
  setSelected: (b) => set({ selected: b }),
  setSim: (k, v) =>
    set((state) => ({ simInputs: { ...state.simInputs, [k]: v } as State['simInputs'] })),
  setColorScheme: (s) => set({ colorScheme: s }),
  toggleLayer: (k) => set((state) => ({ [k]: !state[k] } as Partial<State>)),
}));
