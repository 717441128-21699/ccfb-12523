import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AnnounceTemplate,
  LineConfig,
  ScheduledPlan,
  Settings,
  Station,
} from '../types';
import {
  DEFAULT_SETTINGS,
  SEED_LINE,
  SEED_STATIONS,
  SEED_TEMPLATES,
} from '../data/seed';

interface AppState {
  stations: Station[];
  lines: LineConfig[];
  templates: AnnounceTemplate[];
  plans: ScheduledPlan[];
  settings: Settings;
  seeded: boolean;

  addStation: (s: Station) => void;
  updateStation: (id: string, patch: Partial<Station>) => void;
  removeStation: (id: string) => void;

  updateLine: (id: string, patch: Partial<LineConfig>) => void;
  moveStation: (lineId: string, stationId: string, dir: -1 | 1) => void;
  setDwell: (lineId: string, index: number, seconds: number) => void;

  addTemplate: (t: AnnounceTemplate) => void;
  updateTemplate: (id: string, patch: Partial<AnnounceTemplate>) => void;
  removeTemplate: (id: string) => void;

  addPlan: (p: ScheduledPlan) => void;
  updatePlan: (id: string, patch: Partial<ScheduledPlan>) => void;
  removePlan: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  resetAll: () => void;
}

const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const newId = uid;

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      stations: SEED_STATIONS,
      lines: [SEED_LINE],
      templates: SEED_TEMPLATES,
      plans: [],
      settings: DEFAULT_SETTINGS,
      seeded: true,

      addStation: (s) => set((st) => ({ stations: [...st.stations, s] })),
      updateStation: (id, patch) =>
        set((st) => ({
          stations: st.stations.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      removeStation: (id) =>
        set((st) => ({
          stations: st.stations.filter((s) => s.id !== id),
          lines: st.lines.map((l) => ({
            ...l,
            stationIds: l.stationIds.filter((x) => x !== id),
            dwellSeconds: l.dwellSeconds.filter((_, i) => l.stationIds[i] !== id),
          })),
        })),

      updateLine: (id, patch) =>
        set((st) => ({
          lines: st.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      moveStation: (lineId, stationId, dir) =>
        set((st) => ({
          lines: st.lines.map((l) => {
            if (l.id !== lineId) return l;
            const i = l.stationIds.indexOf(stationId);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= l.stationIds.length) return l;
            const ids = l.stationIds.slice();
            const dwell = l.dwellSeconds.slice();
            [ids[i], ids[j]] = [ids[j], ids[i]];
            [dwell[i], dwell[j]] = [dwell[j], dwell[i]];
            return { ...l, stationIds: ids, dwellSeconds: dwell };
          }),
        })),
      setDwell: (lineId, index, seconds) =>
        set((st) => ({
          lines: st.lines.map((l) => {
            if (l.id !== lineId) return l;
            const dwellSeconds = l.dwellSeconds.slice();
            dwellSeconds[index] = seconds;
            return { ...l, dwellSeconds };
          }),
        })),

      addTemplate: (t) => set((st) => ({ templates: [...st.templates, t] })),
      updateTemplate: (id, patch) =>
        set((st) => ({
          templates: st.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      removeTemplate: (id) =>
        set((st) => ({ templates: st.templates.filter((t) => t.id !== id) })),

      addPlan: (p) => set((st) => ({ plans: [...st.plans, p] })),
      updatePlan: (id, patch) =>
        set((st) => ({
          plans: st.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removePlan: (id) => set((st) => ({ plans: st.plans.filter((p) => p.id !== id) })),

      updateSettings: (patch) =>
        set((st) => ({ settings: { ...st.settings, ...patch } })),

      resetAll: () =>
        set({
          stations: SEED_STATIONS,
          lines: [SEED_LINE],
          templates: SEED_TEMPLATES,
          plans: [],
          settings: DEFAULT_SETTINGS,
        }),
    }),
    {
      name: 'metro-announce-store',
      version: 1,
      // 音频 PCM 不持久化，只持久化配置数据
      partialize: (s) => ({
        stations: s.stations,
        lines: s.lines,
        templates: s.templates,
        plans: s.plans,
        settings: s.settings,
      }),
    },
  ),
);
