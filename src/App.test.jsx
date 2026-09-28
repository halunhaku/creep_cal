import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('switches between calculation, batch, and reference workspaces', async () => {
  render(<App />);

  await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });

  fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
  await screen.findByRole('heading', { name: /dataset pipeline/i });

  fireEvent.click(screen.getByRole('button', { name: 'Reference' }));
  await screen.findByRole('heading', { name: /model standards and equations/i });
});
