import {DOCUMENT} from '@angular/common';
import {InjectionToken, computed, effect, inject} from '@angular/core';
import {
  getState,
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import {
  ChartKind,
  DEFAULT_LAYOUT,
  Density,
  LAYOUT_KEY,
  Layout,
  PanelId,
  Theme,
  parseLayout,
  swapPanels,
} from '../core/layout';

/** Minimal storage seam so tests (and private windows) never touch the real one. */
export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Where the layout is persisted; defaults to localStorage, guarded by try/catch. */
export const LAYOUT_STORAGE = new InjectionToken<LayoutStorage>(
  'LAYOUT_STORAGE',
  {
    providedIn: 'root',
    factory: () => ({
      getItem: key => {
        try {
          return globalThis.localStorage?.getItem(key) ?? null;
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          globalThis.localStorage?.setItem(key, value);
        } catch {
          // storage blocked or full: the workspace still works, it just forgets
        }
      },
    }),
  }
);

/** Layout plus the transient UI state that is deliberately not persisted. */
interface WorkspaceState extends Layout {
  maximized: PanelId | null;
  hover: PanelId | null;
  paletteOpen: boolean;
  helpOpen: boolean;
}

/** Keys of {@link Layout}, used to pick the persisted slice. */
const LAYOUT_FIELDS: ReadonlyArray<keyof Layout> = [
  'v',
  'order',
  'cols',
  'rows',
  'theme',
  'density',
  'sym',
  'chartKind',
  'frameSec',
];

/**
 * Workspace store: arrangement of panels, theme, density, selected symbol and
 * open dialogs. The {@link Layout} part is saved to local storage on every
 * change and restored (validated) on start-up.
 */
export const WorkspaceStore = signalStore(
  {providedIn: 'root'},
  withState<WorkspaceState>(() => ({
    ...parseLayout(inject(LAYOUT_STORAGE).getItem(LAYOUT_KEY)),
    maximized: null,
    hover: null,
    paletteOpen: false,
    helpOpen: false,
  })),
  withComputed(store => ({
    modalOpen: computed(() => store.paletteOpen() || store.helpOpen()),
  })),
  withMethods(store => ({
    setTheme(theme: Theme): void {
      patchState(store, {theme});
    },
    toggleTheme(): void {
      patchState(store, {theme: store.theme() === 'dark' ? 'light' : 'dark'});
    },
    setDensity(density: Density): void {
      patchState(store, {density});
    },
    toggleDensity(): void {
      patchState(store, {
        density: store.density() === 'compact' ? 'cozy' : 'compact',
      });
    },
    selectSym(sym: string | null): void {
      patchState(store, {sym});
    },
    /**
     * Moves the selection through the symbol list, wrapping around.
     *
     * @param symbols Available symbols, sorted.
     * @param direction +1 next, -1 previous.
     */
    stepSym(symbols: readonly string[], direction: 1 | -1): void {
      if (!symbols.length) {
        return;
      }
      const at = symbols.indexOf(store.sym() ?? '');
      const next = (at + direction + symbols.length) % symbols.length;
      patchState(store, {sym: symbols[at < 0 ? 0 : next]});
    },
    swap(a: PanelId, b: PanelId): void {
      patchState(store, {order: swapPanels(store.order(), a, b)});
    },
    setCols(cols: readonly number[]): void {
      if (cols.length === 3) {
        patchState(store, {cols});
      }
    },
    setRows(column: number, sizes: readonly number[]): void {
      if (sizes.length === 2 && column >= 0 && column < 3) {
        const rows = store.rows().map((r, i) => (i === column ? sizes : r));
        patchState(store, {rows});
      }
    },
    setMaximized(id: PanelId | null): void {
      patchState(store, {maximized: id});
    },
    toggleMaximize(id: PanelId): void {
      patchState(store, {maximized: store.maximized() === id ? null : id});
    },
    setHover(id: PanelId | null): void {
      patchState(store, {hover: id});
    },
    setChartKind(chartKind: ChartKind): void {
      patchState(store, {chartKind});
    },
    setFrame(frameSec: number): void {
      patchState(store, {frameSec});
    },
    openPalette(): void {
      patchState(store, {paletteOpen: true, helpOpen: false});
    },
    closePalette(): void {
      patchState(store, {paletteOpen: false});
    },
    openHelp(): void {
      patchState(store, {helpOpen: true, paletteOpen: false});
    },
    closeHelp(): void {
      patchState(store, {helpOpen: false});
    },
    /** Restores the factory layout (keeps theme and density choices). */
    resetLayout(): void {
      patchState(store, {
        order: DEFAULT_LAYOUT.order,
        cols: DEFAULT_LAYOUT.cols,
        rows: DEFAULT_LAYOUT.rows,
        maximized: null,
      });
    },
  })),
  withHooks({
    onInit(store) {
      const storage = inject(LAYOUT_STORAGE);
      const doc = inject(DOCUMENT);
      effect(() => {
        const state = getState(store) as unknown as Record<string, unknown>;
        const slice: Record<string, unknown> = {};
        for (const field of LAYOUT_FIELDS) {
          slice[field] = state[field];
        }
        storage.setItem(LAYOUT_KEY, JSON.stringify(slice));
      });
      effect(() => {
        doc.documentElement.dataset['theme'] = store.theme();
        doc.documentElement.dataset['density'] = store.density();
      });
    },
  })
);
