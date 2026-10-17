# AASHTO LRFD creep and shrinkage model documentation

This application computes creep coefficient `ψ(t,ti)` and shrinkage strain `εsh` using AASHTO LRFD (NCHRP 18-07, incorporated into specification 5.4.2.3 through the FHWA-HRT-05-057 proposed revisions). Input time `t` is concrete age measured from casting; creep duration is `t - ti`, and drying duration is `t - tc`.

## Official document information

| Item | Information | Official source |
| --- | --- | --- |
| Specification provisions | **AASHTO LRFD 5.4.2.3** (creep 5.4.2.3.2, shrinkage 5.4.2.3.3), based on NCHRP 18-07 (Huo, Al-Omaishi, Tadros) | [FHWA-HRT-05-057 Appendix D][1] |
| Independent transcription | **Auburn ALDOT 930989 §3.2.1**, Eqs. 3.1–3.8; a textual version of the same equations | [Auburn report PDF][2] |
| Application | Bridges other than segmental bridges; segmental bridges require project-specific calibration | [Same source][1] |

## Model scope

The applicable design-strength range is in 5.4.2.1 (this application enforces 2.4–15 KSI). The commentary itself states that, without tests or experience, errors of ±50% should be expected from empirical methods. [Source: FHWA C5.4.2.3][1]

Calibration anchor from the original FHWA background: all correction factors equal 1 at `f'ci = 4 KSI、H = 70%、V/S = 3.5 in`. The application's unit tests explicitly pin this anchor.

## Input parameters

| Interface meaning | Batch column | Unit | Description |
| --- | --- | --- | --- |
| Strength at loading | `fci` | MPa | Strength at loading/prestress transfer, 16.5–103.5 (2.4–15 KSI) |
| Relative humidity | `H` | % | Annual mean ambient humidity, 0–100 |
| Volume-to-surface ratio | `vs` | mm | Count only surfaces exposed to drying; capped at 6.0 in by the specification |
| Loading age | `ti` | d | Age at first loading, ≥ 1 |
| Age at end of curing | `tc` | d | Age at start of drying; if drying begins before 5 days, multiply shrinkage by 1.2 |
| Calculation age | `t` | d | Target age measured from casting |

When `t <= ti`, the creep coefficient is 0; when `t <= tc`, shrinkage is 0.

## Equations

Creep coefficient (5.4.2.3.2-1): [Source: FHWA Appendix D][1]

```math
\psi(t,t_i)=1.9k_sk_{hc}k_fk_{td}t_i^{-0.118}
```

```math
k_s=\max(1.0,1.45-0.13(V/S)_{in}),\quad k_{hc}=1.56-0.008H
```

```math
k_f=\frac{5}{1+f'_{ci}},\quad k_{td}=\frac{t}{61-4f'_{ci}+t}
```

Shrinkage strain (5.4.2.3.3-1): the humidity term becomes `khs`; the other factors are shared with creep. [Source: same document][1]

```math
\varepsilon_{sh}=k_sk_{hs}k_fk_{td}\cdot0.48\times10^{-3}
```

```math
k_{hs}=2.00-0.014H
```

For concrete that starts drying before 5 days, multiply shrinkage by 1.2 (the original specification).

## Output definitions

| Output | Unit | Description |
| --- | --- | --- |
| `ψ(t,ti)` | - | Dimensionless creep coefficient |
| `εsh` | µε (negative) | Drying-shrinkage strain |
| `εau` | µε | Always 0 (the model has no autogenous term; retained for matrix alignment) |

Single-point calculation generates a concrete-age curve from 0 to 10000 days.

## Limitations

- This is a coefficient model; it does not calculate compliance, elastic modulus, or structural response. The ti adjustment treating 1 day of accelerated curing as 7 days is optional guidance and is not used here.
- Al-Manaseer & Prado (2015) ranked AASHTO last for both shrinkage and creep in the six-model RILEM/NU-ITI comparison. The commentary anticipates ±50% errors; critical structures require material testing.
- This calculator provides empirical model predictions, not a substitute for material testing, project-specific analysis, or the judgment of a licensed engineer.

## Official sources

1. [FHWA-HRT-05-057 Appendix D][1] — complete 5.4.2.3/5.4.2.4 provisions and calibration commentary.
2. [Auburn ALDOT 930989 §3.2.1][2] — independent textual transcription of the same equations (Eqs. 3.1–3.8).
3. [WSDOT design memorandum 07-2020][3] — modified creep equation for balanced-cantilever segmental bridges (different from the standard equation; reference only).

[1]: https://www.fhwa.dot.gov/publications/research/infrastructure/bridge/05057/appd.cfm
[2]: https://eng.auburn.edu/files/centers/hrc/aldot-930989-final1.pdf
[3]: https://wsdot.wa.gov/publications/fulltext/Bridge/designmemos/07-2020.pdf
