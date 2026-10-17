# Performance benchmark — after

Generated 2026-10-17T10:29:01.430Z by `node scripts/benchmark.mjs`.

## Environment

| | |
|---|---|
| date | 2026-10-17T10:29:01.430Z |
| node | v22.22.3 |
| platform | darwin arm64 |
| os | 27.2 |
| cpu | Apple M4 |
| cores | 10 |
| memoryBytes | 17179869184 |
| chrome | Chrome/155.0.8059.85 |
| runs | 3 |
| rows | 100, 1000, 10000, 20000 |
| cache | disabled (Network.setCacheDisabled) |
| url | http://127.0.0.1:4190/ |

Cache is disabled for every measurement, so each number is a cold load. `vite preview`
serves the build without compression; the byte figures below are computed from the files
on disk, so they are what a compressed host would send.

## Bundle

- initial (referenced by `index.html`): 5 files, 270.9 KiB raw, 85.2 KiB gzip, 73.0 KiB brotli
- lazy (only fetched when a workspace needs it): 16 files, 892.6 KiB raw, 281.3 KiB gzip

| file | initial | raw KiB | gzip KiB | brotli KiB |
|---|---|---:|---:|---:|
| `assets/LineChart-B-E-eql9.js` |  | 327.1 | 96.3 | 81.7 |
| `assets/equations-BC20WbGw.js` |  | 252.7 | 75.1 | 61.8 |
| `assets/react-UyCPWrFZ.js` | yes | 178.0 | 55.7 | 48.1 |
| `assets/DocsPage-DlnkGd7y.js` |  | 80.4 | 34.0 | 30.3 |
| `assets/index-D990a9ma.js` | yes | 51.2 | 18.8 | 15.8 |
| `assets/spreadsheet-0M83R6_t.js` |  | 57.9 | 17.8 | 16.0 |
| `assets/BatchCalculator-BSdIQet2.js` |  | 50.9 | 15.7 | 13.9 |
| `assets/ModelCalculator-D2LcR4p5.js` |  | 40.2 | 12.0 | 10.8 |
| `assets/index-BFO4gB_Y.css` | yes | 37.4 | 8.6 | 7.5 |
| `assets/equations-lxMheimU.css` |  | 29.1 | 7.8 | 6.7 |
| `assets/batchWorker-BNDMjwnx.js` |  | 16.2 | 6.1 | 5.2 |
| `assets/creep_calculator_engine-BVZc_vAI.js` |  | 9.9 | 3.4 | 3.0 |
| `assets/B4Calculator-BnM04V2q.js` |  | 6.0 | 2.7 | 2.2 |
| `assets/B4sCalculator-3YXQ2n5V.js` |  | 5.0 | 2.3 | 1.9 |
| `assets/SingleCalculationDashboard-DCZMbNMy.js` |  | 4.9 | 2.1 | 1.8 |
| `assets/Gl2000Calculator-Ce-lxy4B.js` |  | 4.2 | 1.9 | 1.6 |
| `index.html` | yes | 3.6 | 1.7 | 1.3 |
| `assets/Mc2010Calculator-8n1YVe-T.js` |  | 3.2 | 1.7 | 1.3 |
| `assets/AashtoCalculator-fs2Mtf04.js` |  | 2.6 | 1.4 | 1.1 |
| `assets/Aci209Calculator-B7FAuCIq.js` |  | 2.3 | 1.3 | 1.1 |
| `assets/rolldown-runtime-XKyaHtl9.js` | yes | 0.7 | 0.4 | 0.4 |

## Scenarios

Values are milliseconds unless the metric name says otherwise. `median` is the headline;
`min`/`max` are printed so the spread is visible rather than hidden behind one number.

Deltas are against `before` (2026-10-17T10:09:33.036Z); negative is faster.

### first-load-single

Cold load of the calculation workspace until the first result is on screen (cache disabled).

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| resourceCount | 3 | 15 | 15 | 15 | 16 | -1.00 (-6.3%) |
| transferBytes | 3 | 448265 | 448265 | 448265 | 451101 | -2836.00 (-0.6%) |
| resourceMs | 3 | 76 | 52.8 | 78.2 | 116.5 | -40.50 (-34.8%) |
| domContentLoaded | 3 | 18.4 | 15.3 | 26.4 | 46.1 | -27.70 (-60.1%) |
| load | 3 | 18.6 | 15.4 | 26.6 | 46.1 | -27.50 (-59.7%) |
| fcp | 3 | 56 | 40 | 64 | 64 | -8.00 (-12.5%) |
| lcp | 3 | 56 | 52 | 84 | 64 | -8.00 (-12.5%) |
| shell | 3 | 36.5 | 31 | 47.2 | 47.6 | -11.10 (-23.3%) |
| workspace | 3 | 36.5 | 31 | 47.2 | 47.6 | -11.10 (-23.3%) |
| parameters | 3 | 36.5 | 31 | 47.2 | 348.5 | -312.00 (-89.5%) |
| computed | 3 | 56.8 | 51.2 | 72.2 | 371 | -314.20 (-84.7%) |
| chart | 3 | 102.6 | 91.2 | 121.2 | 417.8 | -315.20 (-75.4%) |

### wasm-init-cold

Import + instantiate of the Rust engine chunk on an otherwise empty same-origin page.

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| importMs | 3 | 2.1 | 2 | 4 | 2.6 | -0.50 (-19.2%) |
| initMs | 3 | 1.9 | 1.6 | 3.8 | 2.2 | -0.30 (-13.6%) |
| totalMs | 3 | 4 | 3.6 | 7.8 | 4.8 | -0.80 (-16.7%) |
| wasmDuration | 3 | 1.3 | 1.2 | 3 | 1.5 | -0.20 (-13.3%) |
| wasmTransfer | 3 | 154054 | 154054 | 154054 | 154054 | +0.00 (+0.0%) |

### single-calculate

Edit one numeric parameter, then press Calculate, measured until the result is settled.

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| wallMs | 3 | 32.1 | 31.8 | 33.9 | 30.5 | +1.60 (+5.2%) |
| computeMs | 3 | 1.2 | 1.2 | 1.3 | 1.3 | -0.10 (-7.7%) |

### single-model-switch

Switch model in the calculation workspace; measured until the new model has computed.

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| wallMs | 3 | 16 | 6.1 | 17.3 | 15.4 | +0.60 (+3.9%) |

### dual-kernel-compare

Run the JS/Rust comparison over the full 10,000-day series.

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| settleMs | 3 | 26.4 | 25.3 | 26.5 | 30.4 | -4.00 (-13.2%) |

### batch-compute-100


| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| computeMs | 3 | 30.4 | 25 | 30.5 | 48.8 | -18.40 (-37.7%) |
| chartMs | 3 | 0 | 0 | 0 | — | — |
| exportMs | 3 | 0.9 | 0.9 | 1.7 | 1.6 | -0.70 (-43.8%) |

### batch-compute-1000


| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| computeMs | 3 | 25.7 | 24.5 | 30.2 | 44 | -18.30 (-41.6%) |
| chartMs | 3 | 0.1 | 0 | 0.1 | — | — |
| exportMs | 3 | 4.3 | 4 | 4.5 | 4.6 | -0.30 (-6.5%) |

### batch-compute-10000


| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| computeMs | 2 | 126.75 | 85 | 168.5 | 110.75 | +16.00 (+14.4%) |
| chartMs | 2 | 0 | 0 | 0 | 0.35 | -0.35 (-100.0%) |
| exportMs | 2 | 30.05 | 28.8 | 31.3 | 30.45 | -0.40 (-1.3%) |

### batch-compute-20000


| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| computeMs | 2 | 163.4 | 162.9 | 163.9 | 185.9 | -22.50 (-12.1%) |
| chartMs | 2 | 0.05 | 0 | 0.1 | 0.05 | +0.00 (+0.0%) |
| exportMs | 2 | 59.55 | 55.7 | 63.4 | 57.15 | +2.40 (+4.2%) |

### batch-chart-toggle

Toggle the batch chart between scatter and line with the widest dataset (20000 rows).

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| settleMs | 2 | 51.2 | 49.8 | 52.6 | 1275.85 | -1224.65 (-96.0%) |

### batch-load

Cold load of the batch workspace until its controls are on screen (no file yet).

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| resourceCount | 3 | 12 | 12 | 12 | 14 | -2.00 (-14.3%) |
| transferBytes | 3 | 308662 | 308662 | 308662 | 312219 | -3557.00 (-1.1%) |
| resourceMs | 3 | 48.2 | 44 | 59.2 | 83.3 | -35.10 (-42.1%) |
| domContentLoaded | 3 | 14.7 | 14.7 | 15.6 | 25.7 | -11.00 (-42.8%) |
| load | 3 | 14.7 | 14.7 | 15.7 | 25.8 | -11.10 (-43.0%) |
| fcp | 3 | 44 | 36 | 52 | 48 | -4.00 (-8.3%) |
| shell | 3 | 30.4 | 29.6 | 34.3 | 27.1 | +3.30 (+12.2%) |
| workspace | 3 | 30.4 | 29.6 | 34.3 | 27.1 | +3.30 (+12.2%) |
| batch | 3 | 30.4 | 29.6 | 34.4 | 330.6 | -300.20 (-90.8%) |

### docs-load

Cold load of the RILEM B4 reference document (Markdown + KaTeX).

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| resourceCount | 3 | 17 | 17 | 17 | 18 | -1.00 (-5.6%) |
| transferBytes | 3 | 348169 | 348169 | 348169 | 448633 | -100464.00 (-22.4%) |
| resourceMs | 3 | 51.8 | 49.3 | 59.3 | 110 | -58.20 (-52.9%) |
| domContentLoaded | 3 | 15 | 14.8 | 15.4 | 29.8 | -14.80 (-49.7%) |
| load | 3 | 17.4 | 17.4 | 17.8 | 30 | -12.60 (-42.0%) |
| fcp | 3 | 36 | 32 | 40 | 48 | -12.00 (-25.0%) |
| shell | 3 | 27.3 | 27.1 | 31.2 | 31.7 | -4.40 (-13.9%) |
| workspace | 3 | 27.3 | 27.1 | 31.2 | 31.7 | -4.40 (-13.9%) |
| docs | 3 | 44.3 | 41.6 | 63.5 | 364.8 | -320.50 (-87.9%) |
| headings | 3 | 11 | 11 | 11 | 11 | +0.00 (+0.0%) |
| equations | 3 | 79 | 79 | 79 | 79 | +0.00 (+0.0%) |
| tables | 3 | 2 | 2 | 2 | 2 | +0.00 (+0.0%) |

### docs-locale-switch

Switch the interface language on the reference page, measured until <html lang> flips.

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| wallMs | 3 | 16.8 | 14.4 | 18.4 | 15.8 | +1.00 (+6.3%) |

### palette-open

Open the command palette from the calculation workspace.

| metric | n | median | min | max | before median | delta |
|---|---:|---:|---:|---:|---:|---:|
| wallMs | 3 | 21.8 | 19.1 | 32.5 | 25.5 | -3.70 (-14.5%) |

## What these numbers do and do not mean

- Wall-clock numbers include React render + commit + paint, not just computation.
- `blocking.sum` and `blocking.max` come from Chrome's longtask observer: tasks over 50 ms.
  A scenario with `blocking.sum` near zero never held the main thread long enough to be felt.
- One machine, one browser, one build. Compare only against a run made the same way on the
  same machine; that is what the environment block above is for.
