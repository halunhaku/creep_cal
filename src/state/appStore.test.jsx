import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getState, resetStore, subscribe } from './appStore';
import { initUrlSync } from './urlSync';

const PARAMS_KEY = 'creep-lab:paramsByModel';
const SETS_KEY = 'creep-lab:parameterSets';

describe('the store survives what localStorage can contain', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /*
   * Regression: loadSets() only checked that the parsed JSON was an object, so a
   * `parameterSets` entry left by an older layout (or edited by hand) reached
   * `saved.map` and the whole calculation workspace was replaced by
   * "Something went wrong" — with no way back from inside the app.
   */
  test('an entry with the wrong shape is dropped, not trusted', async () => {
    localStorage.setItem(SETS_KEY, JSON.stringify({ aci209: 'dry-site', b4: [{ name: 'long span', params: { t0: 28 } }] }));
    localStorage.setItem(PARAMS_KEY, JSON.stringify({ aci209: 'H=35', b4: { h: 60 }, mc2010: null }));
    vi.resetModules();

    // A fresh module instance reads localStorage the way a reload does.
    const fresh = await import('./appStore');
    expect(fresh.getState().parameterSets).toEqual({ b4: [{ name: 'long span', params: { t0: 28 } }] });
    expect(fresh.getState().paramsByModel).toEqual({ b4: { h: 60 } });

    // ... and the workspace still renders, which is the point.
    const { default: App } = await import('../App');
    const { render, screen } = await import('@testing-library/react');
    render(<App />);
    await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });
  });

  test('syntactically corrupt JSON is still ignored', async () => {
    localStorage.setItem(SETS_KEY, '{not json');
    vi.resetModules();
    const fresh = await import('./appStore');
    expect(fresh.getState().parameterSets).toEqual({});
  });
});

describe('store listener contract', () => {
  // Regression: resetStore() called listeners with no argument while every other
  // notification passes the state, and the URL sync's subscriber reads
  // `state.mode` — so resetting the store with the app mounted threw a TypeError.
  test('resetStore hands listeners the new state', () => {
    const seen = [];
    const unsubscribe = subscribe((state) => seen.push(state));
    try {
      resetStore();
      expect(seen).toHaveLength(1);
      expect(seen[0]?.mode).toBe('single');
      expect(seen[0]).toBe(getState());
    } finally {
      unsubscribe();
    }
  });

  test('a store reset while the app is mounted does not throw', () => {
    const teardown = initUrlSync();
    try {
      expect(() => resetStore()).not.toThrow();
    } finally {
      teardown();
    }
  });
});
