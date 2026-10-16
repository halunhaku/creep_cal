import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import BatchCalculator from './BatchCalculator';

function fileInput(container) {
  return container.querySelector('input[type="file"]');
}

function upload(container, content, name) {
  fireEvent.change(fileInput(container), { target: { files: [new File([content], name)] } });
}

function selectModel(container, id) {
  fireEvent.change(container.querySelector('#batch-model'), { target: { value: id } });
}

const ACI_HEADER = 'curingType,t0,H,VS,slump,fineAggregate,airContent,t';
const aciRow = (t) => `moist,28,70,100,100,50,8,${t}`;

describe('BatchCalculator limits', () => {
  test('scatter decimates past 2000 points and captions it', async () => {
    const { container } = render(<BatchCalculator />);
    selectModel(container, 'aci209');
    const rows = Array.from({ length: 2500 }, (_, i) => aciRow(35 + i)).join('\n');
    upload(container, `${ACI_HEADER}\n${rows}\n`, 'big-aci.csv');

    await waitFor(() => expect(screen.getByText(/2500 rows · 1 output field/)).toBeInTheDocument());
    expect(screen.getByText(/decimated from 2500/)).toBeInTheDocument();
  });

  test('files past 20000 rows are rejected before compute', async () => {
    const { container } = render(<BatchCalculator />);
    selectModel(container, 'aci209');
    const rows = Array.from({ length: 20001 }, (_, i) => aciRow(35 + (i % 9000))).join('\n');
    upload(container, `${ACI_HEADER}\n${rows}\n`, 'huge-aci.csv');

    await waitFor(() => expect(screen.getByText(/Split the file/i)).toBeInTheDocument());
    expect(screen.queryByText(/^Result matrix$/)).not.toBeInTheDocument();
  });
});
