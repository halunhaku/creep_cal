import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./components/Aci209Calculator', () => ({
  default: function MockAci209Calculator() {
    return <div>Mocked calculator panel</div>;
  },
}));

test('renders the app shell', () => {
  render(<App />);
  expect(screen.getByText((_, node) => node?.textContent === 'CREEP_LAB')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /single analysis/i })).toBeInTheDocument();
});
