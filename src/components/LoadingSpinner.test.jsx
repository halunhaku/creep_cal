import { act, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import LoadingSpinner from './LoadingSpinner';
import { setLocale } from '../state/appStore';

/**
 * Regression: the spinner carried no `status` role and, with `showMessage={false}`,
 * removed the only text node — so assistive technology was told nothing while the
 * application loaded. The name now comes from the message node itself, which stays
 * in the DOM (visually hidden) when the caller hides it.
 */
const statusNode = (container) => {
  const status = container.querySelector('[role="status"]');
  expect(status).not.toBeNull();
  const id = status.getAttribute('aria-labelledby');
  expect(id, 'the status must be named by an author id').toBeTruthy();
  const target = status.ownerDocument.getElementById(id);
  expect(target, `aria-labelledby should resolve to a node (${id})`).not.toBeNull();
  expect(status.contains(target), 'the name source must belong to this status').toBe(true);
  return { status, target };
};

describe('the loading spinner', () => {
  test('default props expose a named status with the default message', () => {
    const { container } = render(<LoadingSpinner />);

    expect(screen.getByRole('status', { name: 'Loading…' })).toHaveAccessibleName('Loading…');
    expect(screen.getByRole('status', { name: 'Loading…' })).toHaveTextContent('Loading…');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    statusNode(container);
  });

  test('a caller message names the status and the default does not appear', () => {
    render(<LoadingSpinner message="Loading model…" showMessage />);

    expect(screen.getByRole('status', { name: 'Loading model…' })).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  test('hiding the message keeps the status named', () => {
    const { container } = render(<LoadingSpinner showMessage={false} />);

    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    statusNode(container);
  });

  test('hiding a caller message keeps the caller context as the name', () => {
    const { container } = render(<LoadingSpinner message="Loading model…" showMessage={false} />);

    expect(screen.getByRole('status', { name: 'Loading model…' })).toBeInTheDocument();
    statusNode(container);
  });

  test('two spinners keep separate names, so the ids cannot collide', () => {
    render(
      <>
        <LoadingSpinner message="Loading model…" />
        <LoadingSpinner message="Loading workspace…" />
      </>,
    );

    const model = screen.getByRole('status', { name: 'Loading model…' });
    const workspace = screen.getByRole('status', { name: 'Loading workspace…' });
    expect(model).not.toBe(workspace);

    for (const status of [model, workspace]) {
      const id = status.getAttribute('aria-labelledby');
      const target = status.ownerDocument.getElementById(id);
      expect(target).not.toBeNull();
      expect(status.contains(target)).toBe(true);
    }
  });

  test('a node message is not stringified into the accessible name', () => {
    const { container } = render(
      <LoadingSpinner message={<span>Loading model…</span>} showMessage={false} />,
    );

    expect(screen.getByRole('status', { name: 'Loading model…' })).toBeInTheDocument();
    expect(container.querySelector('[role="status"]')).not.toHaveTextContent('[object Object]');
  });

  test('a new message renames the same status', () => {
    const { rerender } = render(<LoadingSpinner />);
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();

    rerender(<LoadingSpinner message="Loading model…" />);
    expect(screen.getByRole('status', { name: 'Loading model…' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading…' })).toBeNull();
  });

  test('locale changes rename the default but not a caller message', () => {
    render(
      <>
        <LoadingSpinner />
        <LoadingSpinner message="Loading model…" />
      </>,
    );
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();

    act(() => setLocale('zh'));

    expect(screen.getByRole('status', { name: '加载中…' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading model…' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading…' })).toBeNull();
  });
});
