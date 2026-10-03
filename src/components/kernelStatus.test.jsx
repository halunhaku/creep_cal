import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';
import KernelStatus from './ui/KernelStatus';
import { setKernelStatus } from '../wasm/creepEngine';

/**
 * Regression: the indicator described only the calculation workspace's engine, so
 * the batch page showed "WASM ready" directly above a line saying the batch
 * computes with the reference kernels.
 */
describe('the kernel indicator', () => {
  test('the batch workspace states the kernel it actually uses', () => {
    setKernelStatus({ engine: 'rust', state: 'ready' });
    render(<KernelStatus workspace="batch" />);

    expect(screen.getByText('Reference kernels')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('title', expect.stringContaining('batch entry points for ACI 209 and MC 2010 only'));
    // Not the loaded engine, which is what the header used to say here.
    expect(screen.queryByText('WASM ready')).not.toBeInTheDocument();
  });

  test('the calculation workspace states the engine and whether it is loaded', () => {
    setKernelStatus({ engine: 'rust', state: 'ready' });
    const { rerender } = render(<KernelStatus workspace="single" />);
    expect(screen.getByText('WASM ready')).toBeInTheDocument();

    setKernelStatus({ engine: 'js', state: 'ready' });
    rerender(<KernelStatus workspace="single" />);
    expect(screen.getByText('JS kernel ready')).toBeInTheDocument();

    setKernelStatus({ engine: null, state: 'idle' });
    rerender(<KernelStatus workspace="single" />);
    expect(screen.getByText('Kernel idle')).toBeInTheDocument();

    setKernelStatus({ engine: 'rust', state: 'failed', failure: 'boom' });
    rerender(<KernelStatus workspace="single" />);
    expect(screen.getByText('WASM unavailable')).toBeInTheDocument();
  });

  test('the reference library says nothing, because nothing is computed there', () => {
    setKernelStatus({ engine: 'rust', state: 'ready' });
    const { container } = render(<KernelStatus workspace="docs" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('the header follows the workspace you are in', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });

    // In the calculation workspace the badge describes the engine. Which state it
    // reports depends on whether the kernel loaded, which jsdom cannot do — what
    // matters here is that it is not the batch's answer.
    expect(screen.getByRole('status')).not.toHaveTextContent('Reference kernels');

    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    await screen.findByRole('heading', { name: /dataset pipeline/i });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Reference kernels'));
  });
});
