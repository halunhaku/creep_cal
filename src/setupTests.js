// jest-dom adds custom matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import { resetStore } from './state/appStore';

// The app store is module-level state that deliberately outlives a workspace
// switch, so without this it would also outlive a test: a parameter edited in
// one case would still be set in the next. The URL is the same kind of state —
// the URL sync reads it on mount, so a workspace pushed by one test would decide
// what the next test starts on. Tests must start from the same state the app
// starts from.
beforeEach(() => {
  resetStore();
  window.history.replaceState(null, '', '/');
});

// jsdom does not implement ResizeObserver, and Recharts' <ResponsiveContainer>
// requires it. Without this shim any component test that mounts a chart dies with
// "ReferenceError: ResizeObserver is not defined", which is why the chart and
// calculation paths had no component coverage.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
