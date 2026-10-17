import { describe, expect, test } from 'vitest';
import { DEFAULT_WORKSPACE, WORKSPACES, workspaceFromUrl } from './workspaces';

describe('workspaceFromUrl', () => {
  test('returns the workspace the URL names', () => {
    expect(workspaceFromUrl('?mode=batch')).toBe('batch');
    expect(workspaceFromUrl('?mode=docs&model=b4')).toBe('docs');
    expect(workspaceFromUrl('?mode=single')).toBe('single');
  });

  test('an absent, unknown or malformed mode is the default, not a crash', () => {
    expect(workspaceFromUrl('')).toBe(DEFAULT_WORKSPACE);
    expect(workspaceFromUrl('?model=b4')).toBe(DEFAULT_WORKSPACE);
    expect(workspaceFromUrl('?mode=__proto__')).toBe(DEFAULT_WORKSPACE);
    expect(workspaceFromUrl('?mode=constructor')).toBe(DEFAULT_WORKSPACE);
    expect(workspaceFromUrl('?mode=')).toBe(DEFAULT_WORKSPACE);
  });

  test('every workspace id has a loader that returns a module', async () => {
    // The entry point resolves one of these before React mounts, so a loader that
    // names a module that no longer exists would be an empty page rather than a
    // spinner — this is the cheap half of that contract (the other half is the
    // browser gate in scripts/, which renders each workspace for real).
    for (const [id, load] of Object.entries(WORKSPACES)) {
      const module = await load();
      expect(typeof module.default, id).toBe('function');
    }
  });
});
