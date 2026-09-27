import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function FormulaExpression({ expr }) {
  const html = React.useMemo(() => katex.renderToString(expr, {
    displayMode: true,
    throwOnError: false,
    strict: false,
  }), [expr]);

  return (
    <div
      className="formula-render flex-1 overflow-x-auto rounded-card border border-line/50 bg-surface px-4 py-3 text-primary"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const MODELS = [
  {
    id: 'aci209',
    name: 'ACI 209R-92',
    category: 'North American Standard',
    engine: ['JS', 'RUST'],
    description: 'Official ACI 209R-92 creep coefficient for moist- or steam-cured concrete. Time is measured from loading, while the input t is concrete age from casting.',
    params: [
      { name: 'curingType', description: 'Curing method: moist or steam' },
      { name: 't0', description: 'Age at loading (days)' },
      { name: 'H', description: 'Ambient relative humidity (%)' },
      { name: 'VS', description: 'Volume / exposed surface ratio (mm)' },
      { name: 'slump', description: 'Concrete slump (mm)' },
      { name: 'fineAggregate', description: 'Fine aggregate / total aggregate by weight (%)' },
      { name: 'airContent', description: 'Air content (%)' },
      { name: 't', description: 'Concrete age from casting (days)' },
    ],
    output: 'φ(t, t₀) — Creep Coefficient (dimensionless)',
    reference: 'ACI Committee 209 (1992, reapproved 2008). Prediction of Creep, Shrinkage, and Temperature Effects in Concrete Structures. ACI 209R-92.',
    officialDocuments: [
      {
        designation: 'ACI PRC-209-92',
        title: 'Prediction of Creep, Shrinkage, and Temperature Effects in Concrete Structures',
        status: 'Published 1992 · Reapproved 2008',
        coverage: 'Primary committee report covering creep, shrinkage, temperature effects, strength development, and stiffness development.',
      },
      {
        designation: 'ACI 209.2R-08',
        title: 'Guide for Modeling and Calculating Shrinkage and Creep in Hardened Concrete',
        status: 'Adopted and published May 2008',
        coverage: 'Comparison guide; Appendix A.1 summarizes ACI 209R-92 and Appendix C.1 contains its numerical example.',
      },
    ],
    applicability: [
      'Hardened concrete moist cured for at least 1 day and loaded after curing or later.',
      'Mean 28-day cylindrical compressive strength range: 20–70 MPa (3000–10000 psi).',
      'Calibrated for typical concrete compositions; concretes with silica fume, more than 30% fly ash, or natural pozzolans require test calibration.',
      'This application implements the creep-coefficient path only; it does not implement ACI shrinkage, strength, stiffness, aging coefficient, or structural-response calculations.',
    ],
    limitations: [
      'ACI committee reports and guides are guidance documents, not mandatory contract language.',
      'Creep predictions have substantial experimental variability; creep-sensitive structures should use project-specific material testing and calibration.',
      'The result is an empirical prediction and does not replace project analysis or qualified engineering judgment.',
    ],
    sourceMapping: [
      'Time-development function: ACI 209R-92 §2.4, Eq. (2-8).',
      'Ultimate coefficient and correction factors: ACI 209R-92 §§2.5–2.6.',
      'Model summary and worked example: ACI 209.2R-08 Appendices A.1 and C.1.',
    ],
    sources: [
      {
        label: 'ACI PRC-209-92 official document details',
        url: 'https://www.concrete.org/publications/internationalconcreteabstractsportal.aspx?id=5089&m=details',
        note: 'Official title, abstract, status, and reapproval information.',
      },
      {
        label: 'ACI PRC-209-92 official product page',
        url: 'https://www.concrete.org/store/productdetail.aspx?Format=DOWNLOAD&ItemID=20992&Language=English&Units=US_AND_METRIC',
        note: 'Official ACI publication and download entry.',
      },
      {
        label: 'ACI 209.2R-08 official guide PDF',
        url: 'https://www.concrete.org/portals/0/files/pdf/previews/209.2r-08web.pdf',
        note: 'Official scope, limitations, model appendix, and numerical-example index.',
      },
      {
        label: 'ACI Committee 209 official page',
        url: 'https://www.concrete.org/getinvolved/committees/directoryofcommittees/acommitteehome/committee_code/c0020900.aspx',
        note: 'Committee responsible for creep and shrinkage documents.',
      },
    ],
    formulas: [
      { label: 'Creep Coefficient', expr: String.raw`\phi(t,t_0)=\frac{(t-t_0)^{0.6}}{10+(t-t_0)^{0.6}}\phi_u` },
      { label: 'Ultimate Creep', expr: String.raw`\phi_u=2.35\gamma_{la}\gamma_{RH}\gamma_{V/S}\gamma_s\gamma_\psi\gamma_\alpha` },
      { label: 'Moist-Cured Loading Age', expr: String.raw`\gamma_{la}=1\ (t_0\le7);\quad1.25t_0^{-0.118}\ (t_0>7)` },
      { label: 'Steam-Cured Loading Age', expr: String.raw`\gamma_{la}=1\ (t_0\le3);\quad1.13t_0^{-0.094}\ (t_0>3)` },
      { label: 'Humidity Factor', expr: String.raw`\gamma_{RH}=1\ (H\le40);\quad1.27-0.0067H\ (H>40)` },
      { label: 'V/S Factor', expr: String.raw`\gamma_{V/S}=\frac{2}{3}\left[1+1.13e^{-0.0213(V/S)}\right]` },
      { label: 'Slump Factor', expr: String.raw`\gamma_s=0.82+0.00264s_{mm}` },
      { label: 'Fine Aggregate Factor', expr: String.raw`\gamma_\psi=0.88+0.0024\psi_{\%}` },
      { label: 'Air Content Factor', expr: String.raw`\gamma_\alpha=\max\left(1,0.46+0.09\alpha_{\%}\right)` },
    ],
  },
  {
    id: 'mc2010',
    name: 'fib Model Code 2010',
    category: 'European Standard',
    engine: ['JS', 'RUST'],
    description: 'The fib Model Code 2010 implementation in this app returns the creep coefficient φ(t,t₀) as the sum of basic creep and drying creep. The current kernel adjusts loading age for temperature and cement class, then uses cross-section size, humidity, strength, and t−t₀ for the final coefficient.',
    params: [
      { name: 'fcm', description: 'Mean compressive strength (MPa)' },
      { name: 'RH', description: 'Relative humidity (%)' },
      { name: 't0', description: 'Age at loading (days)' },
      { name: 'Ac', description: 'Cross-sectional area (mm²)' },
      { name: 'u', description: 'Exposed perimeter (mm)' },
      { name: 'T', description: 'Temperature (°C)' },
      { name: 'Cs', description: 'Cement strength class (e.g., 42.5R)' },
      { name: 't', description: 'Target age from casting (days); batch files provide this column' },
    ],
    output: 'φ(t, t₀) = φ_bc + φ_dc — combined creep coefficient',
    reference: 'fib (2013). fib Model Code for Concrete Structures 2010. Wilhelm Ernst & Sohn.',
    formulas: [
      { label: 'Total Creep', expr: String.raw`\phi(t,t_0)=\phi_{bc}(t,t_0)+\phi_{dc}(t,t_0)` },
      { label: 'Adjusted Loading Age', expr: String.raw`t_{0,T}=t_0\cdot\exp\left(13.65-\frac{4000}{273+T}\right)` },
      { label: 'Cement Class Adjustment', expr: String.raw`t_{0,adj}=t_{0,T}\cdot\left[\frac{9}{2+t_{0,T}^{1.2}}+1\right]^a` },
      { label: 'Notional Size', expr: String.raw`h=\frac{2A_c}{u}` },
      { label: 'Size Limit', expr: String.raw`\beta_h=\min\left(1.5h+250\sqrt{\frac{35}{f_{cm}}},\ 1500\sqrt{\frac{35}{f_{cm}}}\right)` },
      { label: 'Basic Creep', expr: String.raw`\phi_{bc}=\frac{1.8}{f_{cm}^{0.7}}\cdot\ln\left[\left(\frac{30}{t_{0,adj}}+0.035\right)^2(t-t_0)+1\right]` },
      { label: 'Drying Exponent', expr: String.raw`\gamma(t_0)=\frac{1}{2.3+\frac{3.5}{\sqrt{t_{0,adj}}}}` },
      { label: 'Drying Creep', expr: String.raw`\phi_{dc}=\frac{412}{f_{cm}^{1.4}}\cdot\frac{1-RH/100}{(0.1h/100)^{1/3}}\cdot\frac{1}{0.1+t_{0,adj}^{0.2}}\cdot\left(\frac{t-t_0}{\beta_h+t-t_0}\right)^{\gamma}` },
    ],
  },
  {
    id: 'b4',
    name: 'B4 Model',
    category: 'Multi-Decade Comprehensive',
    engine: ['JS', 'RUST'],
    description: 'The B4 implementation in this app returns compliance J(t,t′) and drying shrinkage εsh. It uses equivalent time from temperature, D=2V/S, material coefficients from cement and aggregate type, and composition inputs c, w/c, and a/c.',
    params: [
      { name: 't0', description: 'Drying start age (days)' },
      { name: 'tPrime', description: 'Age at loading / stress application (days)' },
      { name: 'T', description: 'Temperature (°C)' },
      { name: 'h', description: 'Relative humidity (0–1 or %)' },
      { name: 'fc', description: 'Compressive strength (MPa)' },
      { name: 'vS', description: 'V/S ratio — volume to surface (mm)' },
      { name: 'c', description: 'Cement content (kg/m³)' },
      { name: 'wC', description: 'Water-to-cement ratio' },
      { name: 'aC', description: 'Aggregate-to-cement ratio' },
      { name: 'cementType', description: 'Cement type: R, RS, or SL' },
      { name: 'aggregateType', description: 'Aggregate: Quartzite, Limestone, Sandstone, Granite' },
      { name: 'specimenShape', description: 'Specimen shape code (1–5)' },
      { name: 't', description: 'Target age from casting (days); batch files provide this column' },
    ],
    output: 'J(t, t\') — Compliance function (1/GPa), total creep + elastic deformation per unit stress',
    reference: 'Bažant Z.P., Hubler M.H., Yu Q. (2011). Pervasiveness of Excessive Segmental Bridge Deflections: Wake-Up Call for Creep. ACI Struct. J.',
    formulas: [
      { label: 'Temperature Scaling', expr: String.raw`\beta_T=\exp\left[4000\left(\frac{1}{293}-\frac{1}{T+273}\right)\right]` },
      { label: 'Equivalent Time', expr: String.raw`\hat{t}'=t_0\beta_T+(t'-t_0)\beta_T,\qquad \hat{t}=\hat{t}'+(t-t')\beta_T` },
      { label: 'Shrinkage Half-Time', expr: String.raw`\tau_{SH}=\tau_0\cdot k_{s\tau a}\cdot\left(k_s\cdot\frac{2V}{S}\right)^2` },
      { label: 'Shrinkage', expr: String.raw`\varepsilon_{sh}=\varepsilon_{sh\infty}\cdot k_h\cdot\tanh\sqrt{\frac{\max\left(0,(t-t_0)\beta_T\right)}{\tau_{SH}}}` },
      { label: 'Basic Creep', expr: String.raw`C_0=q_2Q+q_3\ln\left[1+\max(0,\hat{t}-\hat{t}')^{0.1}\right]+q_4\ln\left[\max\left(1,\frac{\hat{t}}{\hat{t}'}\right)\right]` },
      { label: 'Drying Creep', expr: String.raw`C_d=q_5\sqrt{\max\left(0,\exp(-p_{5H}H)-\exp(-p_{5H}H_c)\right)}` },
      { label: 'Compliance Function', expr: String.raw`J(t,t')=q_1+\beta_T\cdot C_0+C_d` },
    ],
  },
  {
    id: 'b4s',
    name: 'B4S Model',
    category: 'Simplified Rapid Analysis',
    engine: ['JS', 'RUST'],
    description: 'The B4S implementation keeps the same B4-style compliance and drying shrinkage structure but derives material terms from compressive strength fc and cement type, so it does not require c, w/c, or a/c.',
    params: [
      { name: 't0', description: 'Drying start age (days)' },
      { name: 'tPrime', description: 'Age at loading (days)' },
      { name: 'T', description: 'Temperature (°C)' },
      { name: 'h', description: 'Relative humidity (0–1 or %)' },
      { name: 'fc', description: 'Compressive strength (MPa)' },
      { name: 'vS', description: 'V/S ratio (mm)' },
      { name: 'cementType', description: 'Cement type: R, RS, or SL' },
      { name: 'specimenShape', description: 'Specimen shape code (1–5)' },
      { name: 'aggregateType', description: 'Aggregate type' },
      { name: 't', description: 'Target age from casting (days); batch files provide this column' },
    ],
    output: 'J(t, t\') — Compliance function (1/GPa)',
    reference: 'Bažant Z.P., Baweja S. (2000). Creep and Shrinkage Prediction Model for Analysis and Design of Concrete Structures: Model B3. RILEM Recommendation.',
    formulas: [
      { label: 'Temperature Scaling', expr: String.raw`\beta_T=\exp\left[4000\left(\frac{1}{293}-\frac{1}{T+273}\right)\right]` },
      { label: 'Strength-Based τ₀', expr: String.raw`\tau_0=\tau_{s,cem}\cdot\left(\frac{f_c}{40}\right)^{s_{\tau f}}` },
      { label: 'Shrinkage Half-Time', expr: String.raw`\tau_{SH}=\tau_0\cdot k_{s\tau a}\cdot\left(k_s\cdot\frac{2V}{S}\right)^2` },
      { label: 'Strength-Based q₂', expr: String.raw`q_2=\frac{s_2\left(f_c/40\right)^{s_{2f}}}{1000}` },
      { label: 'Strength-Based q₃', expr: String.raw`q_3=s_3\cdot q_2\cdot\left(\frac{f_c}{40}\right)^{s_{3f}}` },
      { label: 'Strength-Based q₄', expr: String.raw`q_4=\frac{s_4\left(f_c/40\right)^{s_{4f}}}{1000}` },
      { label: 'Shrinkage', expr: String.raw`\varepsilon_{sh}=\varepsilon_{sh\infty}\cdot k_h\cdot\tanh\sqrt{\frac{\max\left(0,(t-t_0)\beta_T\right)}{\tau_{SH}}}` },
      { label: 'Compliance Function', expr: String.raw`J(t,t')=q_1+\beta_T\cdot C_0+C_d` },
    ],
  },
];


export default function DocsPage() {
  const [selected, setSelected] = React.useState('aci209');
  const model = MODELS.find(m => m.id === selected);

  return (
    <div className="max-w-content mx-auto space-y-8 animate-fade-in relative z-10">
      <header className="mb-6">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-green-dark">Reference Library</span>
          <span className="h-px w-8 bg-green-border" aria-hidden="true" />
        </div>
        <h1 className="font-mono text-xl font-bold uppercase tracking-[0.08em] text-primary md:text-2xl">
          Model <span className="text-green-dark">library</span>
        </h1>
        <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-muted">
          Reference documentation for all supported concrete creep & shrinkage prediction models.
        </p>
      </header>

      {/* Model Tabs — segmented */}
      <div className="mb-6 flex flex-wrap gap-1.5 rounded-md border border-line bg-surface-2 p-1">
        {MODELS.map((m, idx) => (
          <button
            key={m.id}
            onClick={() => setSelected(m.id)}
            aria-pressed={selected === m.id}
            className={`rounded px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-150 ${
              selected === m.id
                ? 'active-pill'
                : 'text-muted hover:bg-surface-3 hover:text-primary'
            }`}
          >
            <span className="mr-1.5 text-faint">DOC-{String(idx + 1).padStart(2, '0')}</span>
            {m.name}
          </button>
        ))}
      </div>

      {/* Model Detail Panel */}
      <div className="card p-5 relative overflow-hidden max-w-[1040px] mx-auto md:p-6">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-green-dark font-bold">{model.category}</div>
            <h2 className="font-mono text-lg font-bold uppercase tracking-[0.08em] text-primary md:text-xl">{model.name}</h2>
          </div>
          <div className="flex gap-2">
            {model.engine.map(e => (
              <span key={e} className="tag">{e} Engine</span>
            ))}
          </div>
        </div>

        <p className="mb-8 max-w-[92ch] text-sm leading-relaxed text-muted">{model.description}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Parameters Table */}
          <div className="doc-section">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-3">
              <h3 className="font-sans text-sm uppercase doc-section-title">Input Parameters</h3>
              <span className="tag text-[10px]">{model.params.length} fields</span>
            </div>
            <div className="space-y-2">
              {model.params.map(p => (
                <div key={p.name} className="flex items-start gap-3 p-3 rounded-card bg-surface border border-line">
                  <code className="text-xs font-mono font-bold text-green shrink-0 w-24 pt-0.5">{p.name}</code>
                  <span className="text-primary text-sm leading-relaxed">{p.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Output & Reference */}
          <div className="doc-section space-y-6">
            <div>
              <h3 className="font-sans text-sm uppercase doc-section-title mb-4">Output</h3>
              <div className="p-4 rounded-card bg-green-soft border border-green-border shadow-sm">
                <p className="font-mono text-sm text-green-dark">{model.output}</p>
              </div>
            </div>

            <div>
              <h3 className="font-sans text-sm uppercase doc-section-title mb-4">Reference</h3>
              <div className="p-4 rounded-card bg-surface border border-line">
                <p className="text-primary text-sm leading-relaxed italic">{model.reference}</p>
              </div>
            </div>

            {model.officialDocuments && (
              <div>
                <h3 className="font-sans text-sm uppercase doc-section-title mb-4">Official Documents</h3>
                <div className="space-y-2">
                  {model.officialDocuments.map((document) => (
                    <div key={document.designation} className="p-4 rounded-card bg-surface border border-line">
                      <div className="font-mono text-xs font-bold text-green-dark">{document.designation}</div>
                      <div className="mt-1 text-sm font-medium text-primary">{document.title}</div>
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{document.status}</div>
                      <p className="mt-2 text-xs leading-relaxed text-muted">{document.coverage}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-sans text-sm uppercase doc-section-title mb-4">Computation Engine</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-card bg-surface border border-green-border">
                  <span className="material-symbols-outlined text-green text-[18px]" aria-hidden="true">memory</span>
                  <div>
                    <div className="text-xs font-label uppercase tracking-[0.12em] text-green-dark font-bold">RUST WASM Kernel</div>
                    <div className="text-[11px] text-muted mt-0.5">High-performance WebAssembly, ~10k points in &lt;50ms</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-card bg-surface border border-line">
                  <span className="material-symbols-outlined text-muted text-[18px]" aria-hidden="true">javascript</span>
                  <div>
                    <div className="text-xs font-label uppercase tracking-[0.12em] text-muted font-bold">Standard JS Engine</div>
                    <div className="text-[11px] text-muted mt-0.5">Pure JavaScript reference implementation</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {(model.applicability || model.limitations) && (
          <div className="mb-8 grid grid-cols-1 gap-6 border-t border-line/20 pt-8 md:grid-cols-2">
            {model.applicability && (
              <section>
                <h3 className="mb-4 font-sans text-sm uppercase doc-section-title">Applicability</h3>
                <ul className="space-y-2 text-sm leading-relaxed text-muted">
                  {model.applicability.map((item) => (
                    <li key={item} className="rounded-card border border-line bg-surface p-3">{item}</li>
                  ))}
                </ul>
              </section>
            )}
            {model.limitations && (
              <section>
                <h3 className="mb-4 font-sans text-sm uppercase doc-section-title">Limitations</h3>
                <ul className="space-y-2 text-sm leading-relaxed text-muted">
                  {model.limitations.map((item) => (
                    <li key={item} className="rounded-card border border-line bg-surface p-3">{item}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {model.sourceMapping && (
          <section className="mb-8 border-t border-line/20 pt-8">
            <h3 className="mb-4 font-sans text-sm uppercase doc-section-title">Formula Source Mapping</h3>
            <div className="space-y-2">
              {model.sourceMapping.map((item) => (
                <div key={item} className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-primary">{item}</div>
              ))}
            </div>
          </section>
        )}

        {model.sources && (
          <section className="mb-8 border-t border-line/20 pt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-sans text-sm uppercase doc-section-title">Official Sources</h3>
              <span className="tag text-[10px]">ACI links</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {model.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-card border border-green-border bg-green-soft p-4 transition-colors hover:bg-surface-3"
                >
                  <div className="font-mono text-xs font-bold text-green-dark">{source.label}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{source.note}</p>
                  <span className="mt-2 block break-all font-mono text-[10px] text-faint">{source.url}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Formulas Section */}
        {model.formulas && (
          <div className="border-t border-line/20 pt-8 mt-2">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h3 className="font-sans text-sm uppercase doc-section-title">Core Calculation Formulas</h3>
              <span className="tag text-[10px]">{model.formulas.length} formulas</span>
            </div>
            <div className="space-y-3">
              {model.formulas.map((f, i) => (
                <div key={i} className="flex flex-col gap-3 p-4 md:p-5 rounded-card bg-surface-soft border border-line">
                  <span className="text-[10px] font-label uppercase tracking-[0.13em] shrink-0 sm:w-52 text-green-dark font-bold">{f.label}</span>
                  <FormulaExpression expr={f.expr} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
