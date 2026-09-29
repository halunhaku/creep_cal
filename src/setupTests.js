// jest-dom adds custom matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

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
