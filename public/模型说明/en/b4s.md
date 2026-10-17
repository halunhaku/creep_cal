# RILEM Model B4s documentation: strength-based simplified creep and shrinkage of concrete

This project implements the strength-based simplified prediction **Model B4s**, formally recommended in **RILEM TC-242-MDC (2015) §1.8** (*Materials and Structures* 48(4):753–770).

Model B4s is a simplified formulation for preliminary design or for cases in which the mix composition has not yet been finalized. It estimates creep and shrinkage using only the 28-day compressive strength $f_c$ and macroscopic environmental parameters.

---

## 1. Input parameters and domain

| Interface meaning | Batch column | Unit | Calibrated range | Description |
| --- | --- | --- | --- | --- |
| Age at start of drying | `t0` | d | `t0 ≥ 1` | Age at demolding and start of drying |
| Loading age | `tPrime` | d | `tPrime ≥ 1` | Age at application of uniaxial compressive stress |
| Curing temperature | `Tcur` | °C | `20 ≤ Tcur ≤ 30` | Temperature during curing |
| Drying temperature | `Tsh` | °C | `-25 ≤ Tsh ≤ 75` | Ambient temperature during drying |
| Temperature under load | `Tc` | °C | `-25 ≤ Tc ≤ 75` | Ambient temperature under load |
| Relative humidity | `h` | % | `0 ≤ h ≤ 98.4` | Ambient relative humidity (percent). The 98.4% limit has the same basis as B4: $k_h$ reaches zero at 98.4544%, producing a negative-exponent singularity in $q_5$. |
| 28-day mean cylinder compressive strength | `fc` | MPa | `15 ≤ fc ≤ 70` | Measured 28-day mean cylinder strength |
| Volume-to-surface ratio | `vS` | mm | `12 ≤ vS ≤ 120` | Member $V/S$; effective thickness $D = 2V/S$ |
| Cement hydration/reactivity class | `cementType` | - | `R`, `RS`, `SL` | `R` (regular), `RS` (rapid-hardening), `SL` (slow-hardening) |
| Aggregate type | `aggregateType` | - | Table 6 | See the aggregate-coefficient table |
| Specimen shape factor | `specimenShape` | - | `1`–`5` | 1=slab, 2=cylinder, 3=prism, 4=sphere, 5=cube |
| Calculation age | `t` | d | `t ≥ 0` | Target total age measured from casting |

---

## 2. Simplified scaling equations (Eqs. 44–52, Tables 7–9)

$$q_2 = \frac{s_2}{1\text{ GPa}}\left(\frac{f_c}{40}\right)^{s_{2f}}$$

$$q_3 = s_3 q_2 \left(\frac{f_c}{40}\right)^{s_{3f}}$$

$$q_4 = \frac{s_4}{1\text{ GPa}}\left(\frac{f_c}{40}\right)^{s_{4f}}$$

$$q_5 = \frac{s_5}{1\text{ GPa}}\left(\frac{f_c}{40}\right)^{s_{5f}}\left|k_h \varepsilon_{sh\infty}\right|^{p_{5\varepsilon}}$$

$$\tau_0 = \tau_{s,cem}\left(\frac{f_c}{40}\right)^{s_{\tau f}}$$

$$\varepsilon_0 = \varepsilon_{s,cem}\left(\frac{f_c}{40}\right)^{s_{\varepsilon f}}$$

### Coefficient table (Table 9)

- R-class cement: $s_2 = 14.2\times 10^{-3}$, $s_3 = 0.976$, $s_4 = 4.00\times 10^{-3}$, $s_5 = 1.54\times 10^{-3}$, $s_{2f} = -1.58$, $s_{3f} = -1.61$, $s_{4f} = -1.16$, $s_{5f} = -0.45$.

Note: the value $q_4 = 6.9 \times 10^{-3}$ printed in the numerical line of the original §1.9 example is a typesetting discrepancy specific to that example. The normative Table 9 specifies $s_4 = 4.00\times 10^{-3}$ consistently. This project follows the official coefficient definitions in Table 9.

---

## 3. Official references

- **Bažant, Z. P., Jirásek, M., Hubler, M. H., & Carol, I. (2015).** *RILEM draft recommendation: TC-242-MDC...* **Materials and Structures**, 48(4), 753–770. [DOI: 10.1617/s11527-014-0485-2](https://doi.org/10.1617/s11527-014-0485-2)
