import React from 'react';
import katex from 'katex';
import { setModel, useAppSelector } from '../state/appStore';
import { unitLabelFor } from '../math/parameterUnits';
import 'katex/dist/katex.min.css';

function FormulaExpression({ expr }) {
  const html = React.useMemo(() => katex.renderToString(expr, {
    displayMode: true,
    throwOnError: false,
    strict: false,
  }), [expr]);

  return (
    <div
      className="formula-render flex-1 overflow-x-auto rounded-md border border-line bg-surface px-4 py-4 text-primary"
      tabIndex={0}
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
      { name: 't0', description: 'Age at loading' },
      { name: 'H', description: 'Ambient relative humidity' },
      { name: 'VS', description: 'Volume / exposed surface ratio' },
      { name: 'slump', description: 'Concrete slump' },
      { name: 'fineAggregate', description: 'Fine aggregate / total aggregate by weight' },
      { name: 'airContent', description: 'Air content' },
      { name: 't', description: 'Concrete age from casting' },
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
        label: 'Auburn ALDOT 930-373 Table 6.2 ACI 209 correction factors',
        url: 'https://eng.auburn.edu/files/centers/hrc/930-373-1.pdf',
        note: 'Independent check: BT-54 correction factors reproduced factor-by-factor (pinned in aciAuburnFactors.test.js); shrinkage column is out of kernel scope by design.',
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
    category: 'fib International Model Code',
    engine: ['JS', 'RUST'],
    description: 'Published fib Model Code 2010 creep formulation from §5.1.9.4.3. The implementation returns basic creep, drying creep, and total creep; Eq. 5.1-74 applies the nonlinear stress correction when 0.4 < |σ|/fcm ≤ 0.6.',
    params: [
      { name: 'fcm', description: 'Mean compressive strength, 20–130 MPa' },
      { name: 'RH', description: 'Relative humidity, 40–100%' },
      { name: 't0', description: 'Age at loading, at least 1 day' },
      { name: 'Ac', description: 'Cross-sectional area, positive' },
      { name: 'u', description: 'Drying perimeter, positive' },
      { name: 'T', description: 'Constant curing temperature before loading, 5–30°C' },
      { name: 'Cs', description: 'Cement strength class: 32.5 N/R, 42.5 N/R, or 52.5 N/R' },
      { name: 'sigma', description: 'Initial concrete stress σ, with |σ| ≤ 0.6fcm' },
      { name: 't', description: 'Concrete age from casting; batch files provide this column' },
    ],
    output: 'φ, φbc, φdc, nonlinear factor — total, basic, drying, and stress correction results',
    reference: 'fib (2013). fib Model Code for Concrete Structures 2010. Wilhelm Ernst & Sohn.',
    officialDocuments: [
      {
        designation: 'fib Model Code 2010',
        title: 'fib Model Code for Concrete Structures 2010',
        status: 'Final hardcover and e-book · Published October 2013',
        coverage: 'Final two-volume Model Code published by Ernst & Sohn; this app implements the creep-coefficient formulation in §5.1.9.4.3.',
      },
      {
        designation: 'fib Bulletin 65',
        title: 'Model Code 2010, Final Draft — Volume 1',
        status: 'Final draft · March 2012',
        coverage: 'The official table of contents identifies §5.1.9.4 as Creep and shrinkage and §5.1.10.7 as temperature effects.',
      },
    ],
    applicability: [
      'Mean compressive strength fcm: 20–130 MPa; relative humidity RH: 40–100%; loading age t0: at least 1 day.',
      'Standard environmental temperature range: 5–30°C. T is treated as constant over curing before loading in Eq. 5.1-85.',
      'Initial stress ratio must satisfy |σ|/fcm ≤ 0.6. The nonlinear factor is one up to 0.4 and exp[1.5(|σ|/fcm−0.4)] above 0.4.',
      'The curve uses concrete age t from casting and elapsed loading time t−t0; all creep components are zero for t ≤ t0.',
    ],
    limitations: [
      'This application implements the MC2010 creep-coefficient path only; shrinkage, compliance, strength development, durability, and structural-response provisions are outside scope.',
      'Only a constant curing temperature before loading is accepted. Variable temperature histories and extreme-temperature effects under §5.1.10.7 are not implemented.',
      'The formulas predict material behaviour and do not replace project-specific testing, calibration, structural analysis, or qualified engineering judgment.',
    ],
    sourceMapping: [
      'Basic, drying, and total creep: MC2010 §5.1.9.4.3, Eqs. 5.1-63–5.1-73.',
      'Nonlinear initial-stress correction: MC2010 §5.1.9.4.3, Eq. 5.1-74.',
      'Temperature-adjusted age: MC2010 Eq. 5.1-85; this app evaluates its constant-temperature case.',
      'Implemented ranges and benchmark values are cross-checked against fib-maintained StructuralCodes MC2010 functions and tests.',
    ],
    sources: [
      {
        label: 'fib final publication announcement',
        url: 'https://www.fib-international.org/news/260-fib-model-code-2010-hardcover-edition-discount-for-fib-members.html',
        note: 'Official publication date, publisher, and final two-volume edition information.',
      },
      {
        label: 'fib Bulletin 65 official table of contents',
        url: 'https://www.fib-international.org/images/abstracts/table_contents/fib_bulletin_65_contents.pdf',
        note: 'Official section placement for creep, shrinkage, and temperature effects.',
      },
      {
        label: 'fib StructuralCodes MC2010 creep documentation',
        url: 'https://fib-international.github.io/structuralcodes/api/codes/mc2010/creep_shrinkage.html',
        note: 'fib-maintained executable documentation for equations, ranges, and outputs.',
      },
      {
        label: 'fib StructuralCodes MC2010 reference source',
        url: 'https://github.com/fib-international/structuralcodes/blob/main/structuralcodes/codes/mc2010/_concrete_creep_and_shrinkage.py',
        note: 'fib-maintained open-source equation mapping used for implementation cross-checks.',
      },
    ],
    formulas: [
      { label: 'Total Creep', expr: String.raw`\phi=(\phi_{bc}+\phi_{dc})k_\sigma` },
      { label: 'Constant-Temperature Age', expr: String.raw`t_{0,T}=t_0\exp\left(13.65-\frac{4000}{273+T}\right)` },
      { label: 'Adjusted Loading Age', expr: String.raw`t_{0,adj}=\max\left\{t_{0,T}\left[\frac{9}{2+t_{0,T}^{1.2}}+1\right]^a,\ 0.5\right\}` },
      { label: 'Notional Size', expr: String.raw`h=\frac{2A_c}{u}` },
      { label: 'Size Limit', expr: String.raw`\beta_h=\min\left(1.5h+250\sqrt{\frac{35}{f_{cm}}},\ 1500\sqrt{\frac{35}{f_{cm}}}\right)` },
      { label: 'Basic Creep', expr: String.raw`\phi_{bc}=\frac{1.8}{f_{cm}^{0.7}}\ln\left[\left(\frac{30}{t_{0,adj}}+0.035\right)^2(t-t_0)+1\right]` },
      { label: 'Drying Exponent', expr: String.raw`\gamma(t_0)=\frac{1}{2.3+3.5/\sqrt{t_{0,adj}}}` },
      { label: 'Drying Creep', expr: String.raw`\phi_{dc}=\frac{412}{f_{cm}^{1.4}}\frac{1-RH/100}{(0.1h/100)^{1/3}}\frac{1}{0.1+t_{0,adj}^{0.2}}\left(\frac{t-t_0}{\beta_h+t-t_0}\right)^{\gamma}` },
      { label: 'Nonlinear Stress Factor', expr: String.raw`k_\sigma=\begin{cases}1,&|\sigma|/f_{cm}\le0.4\\\exp[1.5(|\sigma|/f_{cm}-0.4)],&0.4<|\sigma|/f_{cm}\le0.6\end{cases}` },
    ],
  },
  {
    id: 'b4',
    name: 'RILEM Model B4',
    category: 'RILEM Multi-Decade Model',
    engine: ['JS', 'RUST'],
    description: 'RILEM TC-242-MDC (2015) Model B4 composition-based mean prediction. Evaluates compliance function J(t,t′), drying shrinkage εsh, autogenous shrinkage εau, and total shrinkage εsh,total with equivalent temperature times, Tables 4–5 admixture corrections, and Table 6 aggregate scaling.',
    params: [
      { name: 't0', description: 'Age when drying begins, t0 ≥ 1' },
      { name: 'tPrime', description: 'Age at loading / stress application, t′ ≥ 1' },
      { name: 'Tcur', description: 'Curing temperature, calibrated for 20–30°C' },
      { name: 'Tsh', description: 'Drying temperature before loading, -25 to 75°C' },
      { name: 'Tc', description: 'Temperature after loading, -25 to 75°C' },
      { name: 'h', description: 'Ambient relative humidity, 0–98.4%' },
      { name: 'fc', description: 'Mean 28-day cylinder compressive strength, 15–70 MPa' },
      { name: 'vS', description: 'Volume-to-surface ratio V/S, 12–120 mm' },
      { name: 'c', description: 'Cement content, 200–1500 kg/m³' },
      { name: 'wC', description: 'Water-to-cement ratio by weight, 0.22–0.87' },
      { name: 'aC', description: 'Aggregate-to-cement ratio by weight, 1.0–13.2' },
      { name: 'cementType', description: 'Cement reactivity class: R (regular), RS (rapid), SL (slow)' },
      { name: 'aggregateType', description: 'Aggregate type from Table 6 (Diabase, Quartzite, Limestone, Sandstone, Granite, Quartz Diorite, Unknown)' },
      { name: 'specimenShape', description: 'Specimen shape factor ks from Table 1: 1 (slab), 2 (cylinder), 3 (prism), 4 (sphere), 5 (cube)' },
      { name: 'retarder', description: 'Retarder dosage (% of cement weight)' },
      { name: 'flyAsh', description: 'Fly ash dosage (% of cement weight)' },
      { name: 'superplasticizer', description: 'Superplasticizer dosage (% of cement weight)' },
      { name: 'silicaFume', description: 'Silica fume dosage (% of cement weight)' },
      { name: 'airEntrainingAgent', description: 'Air-entraining agent dosage (% of cement weight)' },
      { name: 'waterReducer', description: 'Water reducer dosage (% of cement weight)' },
      { name: 't', description: 'Target concrete age from casting' },
    ],
    output: 'J(t,t′) in 1/GPa (10⁻⁶/MPa internally), εsh (drying), εau (autogenous), and εsh,total (total shrinkage)',
    reference: 'Bažant Z.P., Jirásek M., Hubler M.H., Carol I. (2015). Model B4 for creep, drying shrinkage and autogenous shrinkage of normal and high-strength concretes with multi-decade applicability (RILEM draft recommendation: TC-242-MDC). Materials and Structures, 48(4), 753–770. DOI: 10.1617/s11527-014-0485-2.',
    officialDocuments: [
      {
        designation: 'RILEM TC-242-MDC Recommendation',
        title: 'Model B4 for creep, drying shrinkage and autogenous shrinkage of normal and high-strength concretes with multi-decade applicability',
        status: 'Materials and Structures 48(4):753–770 · Published 2015',
        coverage: 'Authoritative recommendation defining constitutive equations, parameter tables, temperature equivalence, and numerical verification examples.',
      },
      {
        designation: 'Materials and Structures 48(4):771–796',
        title: 'Optimization method, choice of form and uncertainty quantification of Model B4',
        status: 'Companion background paper · 2015',
        coverage: 'Database optimization and statistical justification of basic and drying creep parameters.',
      },
      {
        designation: 'Materials and Structures 48(4):797–814',
        title: 'Statistical justification of Model B4 for drying and autogenous shrinkage',
        status: 'Companion background paper · 2015',
        coverage: 'Calibration and statistical justification for separating autogenous and drying shrinkage.',
      },
    ],
    applicability: [
      'Mean 28-day cylinder compressive strength fc: 15–70 MPa (2,070–10,000 psi).',
      'Water-cement ratio w/c: 0.22–0.87; aggregate-cement ratio a/c: 1.0–13.2; cement content c: 200–1500 kg/m³.',
      'Cross-section volume-surface ratio V/S: 12–120 mm (effective thickness D = 2V/S between 24 and 240 mm).',
      'Curing temperature Tcur: 20–30°C; environmental temperature: -25 to 75°C.',
      'Uniaxial sustained compressive stress within service range: |σ| ≤ 0.45 fc.',
      'Concrete age t ≥ 1 day; not calibrated for very young (<1 d) chemical reactions or ultra-thin sections.',
    ],
    limitations: [
      'The model assumes centric uniaxial compressive stress; bending or high eccentricities require sectional integration.',
      'Temperature acceleration assumes piecewise constant temperatures per stage (Tcur, Tsh, Tc); general temperature histories require rate-type differential integration.',
      'Model predictions give mean expected behavior; structures sensitive to creep must consider parameter uncertainties (w1–w8) and project-specific tests.',
      'Calculations do not replace structural engineering analysis or professional judgment.',
    ],
    sourceMapping: [
      'Total compliance function: Eqs. (12), (27), (28), (40)–(43).',
      'Basic creep C0: Eqs. (30)–(35).',
      'Drying creep Cd: Eqs. (36)–(38).',
      'Drying shrinkage εsh: Eqs. (14)–(22).',
      'Autogenous shrinkage εau: Eqs. (13), (23)–(26).',
      'Temperature activation and equivalent times: Eqs. (8)–(10), (39).',
      'Admixture corrections: Tables 4 and 5.',
      'Aggregate scaling factors: Table 6.',
      'Programming verification: §1.9 worked examples on pp. 764–767.',
    ],
    sources: [
      {
        label: 'RILEM TC-242-MDC official recommendation (Springer)',
        url: 'https://doi.org/10.1617/s11527-014-0485-2',
        note: 'Official primary paper published in Materials and Structures.',
      },
      {
        label: 'Northwestern University Bažant publications repository',
        url: 'http://www.civil.northwestern.edu/people/bazant/',
        note: 'Author publications, NU database documentation, and background technical reports.',
      },
      {
        label: 'Auburn ALDOT 930-989 B4 parameter tables (Tables 3-5/3-6/3-7)',
        url: 'https://eng.auburn.edu/files/centers/hrc/aldot-930989-final1.pdf',
        note: 'Independent third-source check: every shared cement and aggregate cell matches the kernel tables exactly (pinned in b4AuburnTables.test.js).',
      },
    ],
    formulas: [
      { label: 'Total Compliance', expr: String.raw`J(t,t')=q_1+R_T\cdot C_0(\hat{t},\hat{t}')+C_d(\hat{t},\hat{t}',\tilde{t}_0)` },
      { label: 'Total Shrinkage', expr: String.raw`\varepsilon_{sh,total}=\varepsilon_{sh}(\tilde{t},\tilde{t}_0)+\varepsilon_{au}(\tilde{t},\tilde{t}_0)` },
      { label: 'Instantaneous Strain', expr: String.raw`q_1=\frac{p_1}{E_{28}},\quad E_{28}=4734\sqrt{f_c}\text{ (MPa)}` },
      { label: 'Basic Creep Rate', expr: String.raw`C_0=q_2 Q(\hat{t},\hat{t}')+q_3\ln\left[1+(\hat{t}-\hat{t}')^{0.1}\right]+q_4\ln\left(\frac{\hat{t}}{\hat{t}'}\right)` },
      { label: 'Drying Creep', expr: String.raw`C_d=q_5\sqrt{\max\left(0,e^{-p_{5H}H}-e^{-p_{5H}H_c}\right)}` },
      { label: 'Drying Shrinkage', expr: String.raw`\varepsilon_{sh}=\varepsilon_{sh\infty}k_h\tanh\sqrt{\frac{\tilde{t}}{\tau_{sh}}}` },
      { label: 'Autogenous Shrinkage', expr: String.raw`\varepsilon_{au}=\varepsilon_{au\infty}\left[1+\left(\frac{\tau_{au}}{\tilde{t}+\tilde{t}_0}\right)^{\alpha_{au}}\right]^{r_t}` },
    ],
  },
  {
    id: 'b4s',
    name: 'RILEM Model B4s',
    category: 'RILEM Simplified Model',
    engine: ['JS', 'RUST'],
    description: 'RILEM TC-242-MDC (2015) Model B4s simplified strength-based variant. Derives compliance and shrinkage solely from mean compressive strength fc, cement reactivity, aggregate type, specimen geometry, and staged temperatures without needing mix proportions.',
    params: [
      { name: 't0', description: 'Age when drying begins, t0 ≥ 1' },
      { name: 'tPrime', description: 'Age at loading, t′ ≥ 1' },
      { name: 'Tcur', description: 'Curing temperature, calibrated for 20–30°C' },
      { name: 'Tsh', description: 'Drying temperature before loading, -25 to 75°C' },
      { name: 'Tc', description: 'Temperature after loading, -25 to 75°C' },
      { name: 'h', description: 'Ambient relative humidity, 0–98.4%' },
      { name: 'fc', description: 'Mean 28-day cylinder compressive strength, 15–70 MPa' },
      { name: 'vS', description: 'Volume-to-surface ratio V/S, 12–120 mm' },
      { name: 'cementType', description: 'Cement reactivity class: R (regular), RS (rapid), SL (slow)' },
      { name: 'aggregateType', description: 'Aggregate type from Table 6' },
      { name: 'specimenShape', description: 'Specimen shape factor ks: 1 (slab), 2 (cylinder), 3 (prism), 4 (sphere), 5 (cube)' },
      { name: 't', description: 'Target concrete age from casting' },
    ],
    output: 'J(t,t′) in 1/GPa (10⁻⁶/MPa internally), εsh, εau, and εsh,total',
    reference: 'Bažant Z.P., Jirásek M., Hubler M.H., Carol I. (2015). Model B4 for creep, drying shrinkage and autogenous shrinkage of normal and high-strength concretes with multi-decade applicability (RILEM draft recommendation: TC-242-MDC). Materials and Structures, 48(4), 753–770. DOI: 10.1617/s11527-014-0485-2.',
    officialDocuments: [
      {
        designation: 'RILEM TC-242-MDC Recommendation §1.8',
        title: 'Strength-based model for simplified design (B4s)',
        status: 'Materials and Structures 48(4):763–764 · Published 2015',
        coverage: 'Defines B4s parameter scaling Eqs. (44)–(52) and Tables 7–9.',
      },
    ],
    applicability: [
      'Mean 28-day cylinder compressive strength fc: 15–70 MPa.',
      'Cross-section volume-surface ratio V/S: 12–120 mm.',
      'Curing temperature Tcur: 20–30°C; environmental temperature: -25 to 75°C.',
      'Designed for early preliminary estimates when detailed mix design (c, w/c, a/c, admixtures) is not yet finalized.',
    ],
    limitations: [
      'Does not account for mix design variations or chemical admixtures; use composition-based B4 once mix proportions are chosen.',
      'All general B4 uniaxial, age, and temperature limitations apply.',
    ],
    sourceMapping: [
      'B4s shrinkage parameters: Eqs. (44)–(48), Tables 7 and 8.',
      'B4s creep parameters: Eqs. (49)–(52), Table 9.',
      'Verification example: §1.9 pp. 765–767.',
    ],
    sources: [
      {
        label: 'RILEM TC-242-MDC official recommendation (Springer)',
        url: 'https://doi.org/10.1617/s11527-014-0485-2',
        note: 'Official recommendation paper containing §1.8 B4s specification.',
      },
    ],
    formulas: [
      { label: 'Strength-Scaled q₂', expr: String.raw`q_2=\frac{s_2}{1\text{ GPa}}\left(\frac{f_c}{40}\right)^{s_{2f}}` },
      { label: 'Strength-Scaled q₃', expr: String.raw`q_3=s_3 q_2\left(\frac{f_c}{40}\right)^{s_{3f}}` },
      { label: 'Strength-Scaled q₄', expr: String.raw`q_4=\frac{s_4}{1\text{ GPa}}\left(\frac{f_c}{40}\right)^{s_{4f}}` },
      { label: 'Strength-Scaled q₅', expr: String.raw`q_5=\frac{s_5}{1\text{ GPa}}\left(\frac{f_c}{40}\right)^{s_{5f}}\left|k_h\varepsilon_{sh\infty}\right|^{p_{5\varepsilon}}` },
      { label: 'Strength-Scaled τ₀', expr: String.raw`\tau_0=\tau_{s,cem}\left(\frac{f_c}{40}\right)^{s_{\tau f}}` },
      { label: 'Strength-Scaled ε₀', expr: String.raw`\varepsilon_0=\varepsilon_{s,cem}\left(\frac{f_c}{40}\right)^{s_{\varepsilon f}}` },
      { label: 'Total Compliance', expr: String.raw`J(t,t')=q_1+R_T\cdot C_0+C_d` },
    ],
  },
  {
    id: 'gl2000',
    name: 'GL2000',
    category: 'Strength-Based Model',
    engine: ['JS', 'RUST'],
    description: 'Gardner and Lockman GL2000 strength-based prediction (no mix proportions): compliance from the creep coefficient plus drying shrinkage.',
    params: [
      { name: 'cementType', description: 'Cement type: I (normal), II (moderate), III (high-early)' },
      { name: 'fcm28', description: 'Mean 28-day cylinder strength, 16–82 MPa' },
      { name: 'h', description: 'Ambient relative humidity, 20–100 % (96 % for sealed)' },
      { name: 'vs', description: 'Volume-to-surface ratio V/S in mm' },
      { name: 'tc', description: 'Age when drying commences' },
      { name: 't0', description: 'Age at loading, at or after drying start (t0 ≥ tc)' },
      { name: 't', description: 'Target concrete age from casting' },
    ],
    output: 'J(t,t₀) in 1/GPa (10⁻⁶/MPa internally); εsh(t,tc) in µε (negative, shortening); no autogenous term',
    reference: 'Gardner N.J., Lockman M.J. (2001). Design Provisions for Drying Shrinkage and Creep of Normal-Strength Concrete. ACI Materials Journal, 98(2), 159–167.',
    officialDocuments: [
      {
        designation: 'ACI 209.2R-08 Appendix A.4',
        title: 'GL2000 model equations and Table A.14 cement factors',
        status: 'Committee guide · 2008',
        coverage: 'Shrinkage Eqs. (A-98)–(A-101); the C.4 creep table contradicts the appendix and is not a validation target.',
      },
      {
        designation: 'Gardner CJCE comparison paper, Appendix GL2000',
        title: 'Authoritative SI statement of the creep equations [A5]–[A6]',
        status: 'Comparison paper · Gardner',
        coverage: 'Primary-source arbitration: [A6] bracketing, Φ(tc) piecewise form, [A3] strength development, K = 1/0.75/1.15.',
      },
    ],
    applicability: [
      'Mean 28-day cylinder compressive strength fcm28: 16–82 MPa.',
      'Relative humidity h: 20–100 %; sealed concrete is assigned 96 %.',
      'Cement types I, II, III (K = 1.00, 0.75, 1.15 per Table A.14).',
      'Loading at or after drying started (t0 ≥ tc); loading age t0 ≥ 1 day.',
    ],
    limitations: [
      'No autogenous shrinkage, strength, stiffness, or structural-response calculations.',
      'Type-II K differs between sources (guide and Gardner 0.75 vs Auburn 0.70); the author value is implemented.',
      'Creep validated against the C.4 elastic chain, structural properties, and formula triangulation — no open full-curve numeric target exists (C.4 creep table disqualified with proof).',
    ],
    sourceMapping: [
      'Drying shrinkage εsh: Eq. (A-98).',
      'Ultimate shrinkage εshu: Eq. (A-99).',
      'Humidity and time factors β(h), β(t): Eqs. (A-100), (A-101).',
      'Cement factors K and strength rates s: Table A.14, Eq. [A3].',
      'Compliance J and creep coefficient φ28: Eqs. [A5], [A6].',
      'Drying-before-loading factor Φ(tc): piecewise, 1 when t0 = tc.',
      'Validation: C.4.3 shrinkage rows (t = 90 row excluded with proof); C.4.4 elastic chain; structural properties.',
    ],
    sources: [
      {
        label: 'ACI 209.2R-08 full guide (Bažant copy, open PDF)',
        url: 'http://www.civil.northwestern.edu/people/bazant/PDFs/Papers/R21.pdf',
        note: 'Appendix A.4 equations and the C.4 worked example used for validation.',
      },
      {
        label: 'VTRC 04-CR1 shrinkage model equations',
        url: 'https://rosap.ntl.bts.gov/view/dot/19607/dot_19607_DS1.pdf',
        note: 'Independent open transcription of the GL2000 shrinkage equations plus VDOT mixture measurements.',
      },
    ],
    formulas: [
      { label: 'Drying Shrinkage', expr: String.raw`\varepsilon_{sh}=\varepsilon_{shu}\beta(h)\beta(t)` },
      { label: 'Ultimate Shrinkage', expr: String.raw`\varepsilon_{shu}=900K\left(\frac{30}{f_{cm28}}\right)^{1/2}\!\times\!10^{-6}` },
      { label: 'Humidity Factor', expr: String.raw`\beta(h)=1-1.18h^4` },
      { label: 'Time Factor', expr: String.raw`\beta(t)=\left(\frac{t-t_c}{(t-t_c)+0.12(V/S)^2}\right)^{1/2}` },
      { label: 'Compliance', expr: String.raw`J(t,t_0)=\frac{1}{E_{cmto}}+\frac{\phi_{28}}{E_{cm28}}` },
      { label: 'Creep Coefficient', expr: String.raw`\phi_{28}=\Phi(t_c)\cdot(\mathrm{basic}+\mathrm{drying})` },
      { label: 'Loading-Age Factor', expr: String.raw`\Phi(t_c)=1\ (t_0=t_c)` },
    ],
  },
  {
    id: 'aashto',
    name: 'AASHTO LRFD',
    category: 'North American Bridge Code',
    engine: ['JS'],
    description: 'AASHTO LRFD (NCHRP 18-07) creep coefficient and shrinkage for bridge design: strength-based with humidity, size and time factors.',
    params: [
      { name: 'fci', description: 'Strength at loading, 2.4–15 KSI (16.5–103.5 MPa)' },
      { name: 'H', description: 'Average annual ambient humidity, 0–100 %' },
      { name: 'vs', description: 'Volume-to-surface ratio V/S in mm (capped at 6.0 in)' },
      { name: 'ti', description: 'Age at initial loading, ti ≥ 1 day' },
      { name: 'tc', description: 'Curing-end age; shrinkage +20 % when tc < 5 days' },
      { name: 't', description: 'Target concrete age from casting' },
    ],
    output: 'ψ(t,ti) creep coefficient (dimensionless); εsh in µε (negative, shortening); no autogenous term',
    reference: 'AASHTO LRFD Bridge Design Specifications, Article 5.4.2.3 (NCHRP 18-07: Huo, Al-Omaishi, Tadros).',
    officialDocuments: [
      {
        designation: 'FHWA-HRT-05-057 Appendix D',
        title: 'Proposed revisions to the AASHTO LRFD Bridge Design Specifications',
        status: 'Federal report · 2006',
        coverage: 'Full 5.4.2.3/5.4.2.4 specification text with calibration anchors (all factors unity at 4 KSI, 70 %, 3.5 in).',
      },
    ],
    applicability: [
      'Strength at loading fci: 2.4–15 KSI.',
      'Normal-weight concrete, unit weight 0.090–0.155 kcf.',
      'Bridges other than segmentally constructed ones (segmental needs project-specific calibration).',
    ],
    limitations: [
      'Coefficient model only: no compliance, modulus, or structural-response calculations.',
      'The one-day-accelerated-curing counts as seven days ti adjustment is optional guidance and is not applied.',
      'Al-Manaseer & Prado (2015) rank AASHTO last of six models on RILEM/NU-ITI data; expect ±50 % per the commentary.',
    ],
    sourceMapping: [
      'Creep coefficient ψ: Eq. 5.4.2.3.2-1.',
      'Size, humidity, strength, time factors ks/khc/kf/ktd: Eqs. 5.4.2.3.2-2–5.4.2.3.2-5.',
      'Shrinkage εsh and khs: Eqs. 5.4.2.3.3-1–5.4.2.3.3-2.',
    ],
    sources: [
      {
        label: 'FHWA-HRT-05-057 Appendix D (open HTML)',
        url: 'https://www.fhwa.dot.gov/publications/research/infrastructure/bridge/05057/appd.cfm',
        note: 'Complete specification text used for implementation.',
      },
      {
        label: 'Auburn ALDOT 930989 §3.2.1 (open PDF)',
        url: 'https://eng.auburn.edu/files/centers/hrc/aldot-930989-final1.pdf',
        note: 'Independent transcription of the same equations (Eqs. 3.1–3.8).',
      },
    ],
    formulas: [
      { label: 'Creep Coefficient', expr: String.raw`\psi(t,t_i)=1.9k_sk_{hc}k_fk_{td}t_i^{-0.118}` },
      { label: 'Shrinkage Strain', expr: String.raw`\varepsilon_{sh}=k_sk_{hs}k_fk_{td}\cdot0.48\times10^{-3}` },
    ],
  },
];


export default function DocsPage() {
  // The same selection the calculation workspace uses, so ?model=b4 means one
  // thing across the app and a docs page can be linked to directly.
  const selected = useAppSelector((state) => state.model);
  const model = MODELS.find((item) => item.id === selected);
  const sections = [
    ['overview','Overview'], ['parameters','Inputs & units'],
    ...(model.applicability ? [['applicability','Applicability']] : []),
    ...(model.officialDocuments ? [['documents','Documents']] : []),
    ...(model.formulas ? [['formulas','Equations']] : []),
    ...(model.sourceMapping ? [['mapping','Source mapping']] : []),
    ...(model.sources ? [['sources','Official sources']] : []),
  ];

  return (
    <div className="animate-fade-in">
      <header className="mb-6 border-b border-line pb-5">
        <div className="eyebrow">Reference library</div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-primary md:text-display-sm">Model standards and equations</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Implementation scope, calibrated ranges, formula mapping, and primary sources for every prediction model.</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)] 2xl:grid-cols-[210px_minmax(0,1fr)_180px]">
        <aside className="workbench-panel overflow-hidden lg:sticky lg:top-[88px]">
          <div className="border-b border-line px-4 py-3"><div className="eyebrow">Prediction models</div></div>
          <nav className="flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-1" aria-label="Model references">
            {MODELS.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setModel(item.id)}
                aria-pressed={item.id === selected}
                className={`relative min-w-[180px] rounded-md px-3 py-3 text-left lg:w-full lg:min-w-0 ${item.id === selected ? 'bg-green-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-primary'}`}
              >
                {item.id === selected && (
                  <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r bg-green" />
                )}
                <div className="flex gap-2">
                  <span className="font-mono text-3xs text-faint">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-2xs font-semibold">{item.name}</span>
                </div>
                <div className="mt-1 pl-5 font-mono text-3xs uppercase tracking-[.06em] text-faint">{item.category}</div>
              </button>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 workbench-panel overflow-hidden">
          <div id="overview" className="border-b border-line p-5 md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="eyebrow">{model.category}</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-primary">{model.name}</h2>
                <p className="mt-3 max-w-[75ch] text-body-sm leading-7 text-muted">{model.description}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex gap-1.5">
                  {model.engine.map((engine) => (
                    <span key={engine} className="rounded border border-line bg-surface-2 px-2 py-1 font-mono text-3xs font-semibold uppercase tracking-[.07em] text-muted">{engine}</span>
                  ))}
                </div>
                <a
                  href={encodeURI(`/模型说明/${model.id}.md`)}
                  download
                  className="button-secondary !min-h-8 !px-2.5 !text-3xs"
                >
                  Markdown <span lang="zh-CN">说明</span>
                </a>
              </div>
            </div>
            <div className="mt-6 grid gap-4 border-t border-line pt-5 md:grid-cols-2">
              <div>
                <div className="eyebrow">Implementation output</div>
                <p className="mt-2 text-sm leading-6 text-primary">{model.output}</p>
              </div>
              <div>
                <div className="eyebrow">Primary reference</div>
                <p className="mt-2 text-xs leading-5 text-muted">{model.reference}</p>
              </div>
            </div>
          </div>

          <section id="parameters" className="border-b border-line p-5 md:p-7">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="eyebrow">Inputs & units</div>
                <h3 className="mt-1 text-lg font-semibold text-primary">Parameter contract</h3>
              </div>
              <span className="font-mono text-3xs text-faint">{model.params.length} parameters</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-left">
                <thead className="bg-surface-2">
                  <tr>
                    <th className="px-4 py-2.5 font-mono text-3xs uppercase tracking-[.08em] text-faint">Parameter</th>
                    <th className="px-4 py-2.5 font-mono text-3xs uppercase tracking-[.08em] text-faint">Unit</th>
                    <th className="px-4 py-2.5 font-mono text-3xs uppercase tracking-[.08em] text-faint">Definition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {model.params.map((param) => (
                    <tr key={param.name}>
                      <td className="w-32 px-4 py-3 align-top font-mono text-1xs font-semibold text-green">{param.name}</td>
                      <td className="w-20 px-4 py-3 align-top font-mono text-1xs text-muted">{unitLabelFor(param.name)}</td>
                      <td className="px-4 py-3 text-body-sm leading-5 text-muted">{param.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {model.applicability && (
            <section id="applicability" className="border-b border-line p-5 md:p-7">
              <div className="eyebrow">Applicability</div>
              <h3 className="mt-1 text-lg font-semibold text-primary">Calibrated use and limitations</h3>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <div className="mb-2 font-mono text-3xs font-semibold uppercase tracking-[.08em] text-[var(--success)]">Recommended domain</div>
                  <ul className="space-y-2">
                    {model.applicability.map((item) => (
                      <li key={item} className="flex gap-2.5 text-body-sm leading-5 text-muted">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                {model.limitations && (
                  <div>
                    <div className="mb-2 font-mono text-3xs font-semibold uppercase tracking-[.08em] text-[var(--warning)]">Limitations</div>
                    <ul className="space-y-2">
                      {model.limitations.map((item) => (
                        <li key={item} className="flex gap-2.5 text-body-sm leading-5 text-muted">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {model.officialDocuments && (
            <section id="documents" className="border-b border-line p-5 md:p-7">
              <div className="eyebrow">Official documents</div>
              <div className="mt-4 space-y-3">
                {model.officialDocuments.map((doc) => (
                  <div key={doc.designation} className="rounded-lg border border-line bg-surface-2 p-4">
                    <div className="font-mono text-3xs font-semibold uppercase tracking-[.07em] text-green">{doc.designation}</div>
                    <h4 className="mt-1.5 text-sm font-semibold text-primary">{doc.title}</h4>
                    <p className="mt-1 text-xs text-muted">{doc.status}</p>
                    <p className="mt-2 text-body-sm leading-5 text-muted">{doc.coverage}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {model.formulas && (
            <section id="formulas" className="border-b border-line p-5 md:p-7">
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <div className="eyebrow">Core equations</div>
                  <h3 className="mt-1 text-lg font-semibold text-primary">Implemented formulation</h3>
                </div>
                <span className="font-mono text-3xs text-faint">{model.formulas.length} equations</span>
              </div>
              <div className="space-y-3">
                {model.formulas.map((formula, index) => (
                  <div key={formula.label} className="grid gap-3 rounded-lg border border-line bg-surface-2 p-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
                    <div>
                      <span className="font-mono text-3xs text-faint">EQ {String(index + 1).padStart(2, '0')}</span>
                      <div className="mt-1 text-xs font-semibold text-primary">{formula.label}</div>
                    </div>
                    <FormulaExpression expr={formula.expr} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {model.sourceMapping && (
            <section id="mapping" className="border-b border-line p-5 md:p-7">
              <div className="eyebrow">Formula source mapping</div>
              <div className="mt-4 divide-y divide-line rounded-lg border border-line">
                {model.sourceMapping.map((item, index) => (
                  <div key={item} className="grid grid-cols-[32px_1fr] gap-3 px-4 py-3 text-body-sm leading-5 text-muted">
                    <span className="font-mono text-3xs text-faint">{String(index + 1).padStart(2, '0')}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {model.sources && (
            <section id="sources" className="p-5 md:p-7">
              <div className="eyebrow">Official sources</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {model.sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-lg border border-line p-4 transition-colors hover:border-green-border hover:bg-green-soft"
                  >
                    <div className="text-sm font-semibold text-primary group-hover:text-green">{source.label}</div>
                    <p className="mt-1 text-xs leading-5 text-muted">{source.note}</p>
                    <span className="mt-3 block truncate font-mono text-3xs text-faint">{source.url}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </article>

        <aside className="sticky top-[88px] hidden 2xl:block">
          <div className="eyebrow">On this page</div>
          <nav className="mt-3 border-l border-line">
            {sections.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="block border-l border-transparent px-3 py-1.5 text-xs text-muted hover:border-green hover:text-primary"
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}
