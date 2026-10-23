import {TestBed} from '@angular/core/testing';

import {DEFAULT_LAYOUT, LAYOUT_KEY} from '../core/layout';
import {LAYOUT_STORAGE, LayoutStorage, WorkspaceStore} from './workspace.store';

class MemoryStorage implements LayoutStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('WorkspaceStore', () => {
  let storage: MemoryStorage;

  const create = (stored?: unknown): InstanceType<typeof WorkspaceStore> => {
    storage = new MemoryStorage();
    if (stored !== undefined) {
      storage.data.set(LAYOUT_KEY, JSON.stringify(stored));
    }
    TestBed.configureTestingModule({
      providers: [{provide: LAYOUT_STORAGE, useValue: storage}],
    });
    return TestBed.inject(WorkspaceStore);
  };

  it('starts from the default layout when nothing is stored', () => {
    const store = create();
    expect(store.order()).toEqual(DEFAULT_LAYOUT.order);
    expect(store.theme()).toBe('dark');
    expect(store.maximized()).toBeNull();
  });

  it('restores a stored layout', () => {
    const store = create({theme: 'light', density: 'cozy', sym: 'MSFT'});
    expect(store.theme()).toBe('light');
    expect(store.density()).toBe('cozy');
    expect(store.sym()).toBe('MSFT');
  });

  it('persists layout changes but not transient UI state', () => {
    const store = create();
    store.toggleTheme();
    store.swap('quotes', 'ticket');
    store.openPalette();
    TestBed.tick();
    const saved = JSON.parse(storage.data.get(LAYOUT_KEY)!);
    expect(saved.theme).toBe('light');
    expect(saved.order[0]).toBe('ticket');
    expect('paletteOpen' in saved).toBe(false);
    expect('maximized' in saved).toBe(false);
  });

  it('writes the theme and density onto <html> for CSS and Tailwind', () => {
    const store = create();
    store.setTheme('light');
    store.setDensity('cozy');
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(document.documentElement.dataset['density']).toBe('cozy');
  });

  it('toggles density and theme back and forth', () => {
    const store = create();
    store.toggleDensity();
    expect(store.density()).toBe('cozy');
    store.toggleDensity();
    expect(store.density()).toBe('compact');
    store.toggleTheme();
    store.toggleTheme();
    expect(store.theme()).toBe('dark');
  });

  it('steps through symbols with wrap-around', () => {
    const store = create();
    const symbols = ['A', 'B', 'C'];
    store.stepSym(symbols, 1);
    expect(store.sym()).toBe('A');
    store.stepSym(symbols, 1);
    expect(store.sym()).toBe('B');
    store.selectSym('C');
    store.stepSym(symbols, 1);
    expect(store.sym()).toBe('A');
    store.stepSym(symbols, -1);
    expect(store.sym()).toBe('C');
    store.stepSym([], 1);
    expect(store.sym()).toBe('C');
  });

  it('validates sizes before accepting them', () => {
    const store = create();
    store.setCols([10, 20]);
    expect(store.cols()).toEqual(DEFAULT_LAYOUT.cols);
    store.setCols([20, 50, 30]);
    expect(store.cols()).toEqual([20, 50, 30]);
    store.setRows(1, [70, 30]);
    expect(store.rows()[1]).toEqual([70, 30]);
    expect(store.rows()[0]).toEqual(DEFAULT_LAYOUT.rows[0]);
    store.setRows(9, [50, 50]);
    store.setRows(0, [1]);
    expect(store.rows()[0]).toEqual(DEFAULT_LAYOUT.rows[0]);
  });

  it('maximises, restores and tracks the hovered panel', () => {
    const store = create();
    store.toggleMaximize('chart');
    expect(store.maximized()).toBe('chart');
    store.toggleMaximize('chart');
    expect(store.maximized()).toBeNull();
    store.setHover('tape');
    expect(store.hover()).toBe('tape');
  });

  it('keeps the palette and the help dialog mutually exclusive', () => {
    const store = create();
    store.openPalette();
    expect(store.modalOpen()).toBe(true);
    store.openHelp();
    expect(store.paletteOpen()).toBe(false);
    expect(store.helpOpen()).toBe(true);
    store.closeHelp();
    expect(store.modalOpen()).toBe(false);
  });

  it('reset restores the arrangement but keeps theme and density', () => {
    const store = create();
    store.swap('quotes', 'notes');
    store.setCols([10, 10, 80]);
    store.setMaximized('tape');
    store.setTheme('light');
    store.resetLayout();
    expect(store.order()).toEqual(DEFAULT_LAYOUT.order);
    expect(store.cols()).toEqual(DEFAULT_LAYOUT.cols);
    expect(store.maximized()).toBeNull();
    expect(store.theme()).toBe('light');
  });

  it('survives a blocked localStorage (default storage guards with try/catch)', () => {
    const boom = (): never => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', {getItem: boom, setItem: boom});
    try {
      TestBed.configureTestingModule({});
      const store = TestBed.inject(WorkspaceStore);
      expect(store.order()).toEqual(DEFAULT_LAYOUT.order);
      expect(() => {
        store.setTheme('light');
        TestBed.tick();
      }).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
