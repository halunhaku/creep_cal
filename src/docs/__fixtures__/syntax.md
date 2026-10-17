# Reference &amp; units

## Inputs

| Parameter | Unit | Requirement |
| :--- | :---: | ---: |
| `sigma` | MPa | `\|sigma\| ≤ 0.6 fcm` |
| $f_c$ | MPa | 15–70 |

- First item
  - Nested **unordered** item
    1. Nested ordered item
- Second item with *emphasis* and ~~obsolete~~ text
- [x] Checked task

3. Ordered item
4. Next ordered item

> Quoted guidance with a [reference][official].

A [reference][official], an [internal link](#inputs), and inline math $E=4734\sqrt{f_c}$.
Escaped currency \$5 and code `$not_math$` stay literal.

```js
const text = '<img src=x onerror=alert(1)>';
const math = '$not_math$';
```

## Equations

$$
J(t,t')=q_1+C_0+C_d
$$

$$\varepsilon_{sh,total}=\varepsilon_{sh}+\varepsilon_{au}$$

```math
\phi(t,t_0)=\frac{(t-t_0)^{0.6}}{10+(t-t_0)^{0.6}}\phi_u
```

$
t_{0,T}=t_0\exp\left(13.65-\frac{4000}{273+T}\right)
$

[official]: https://example.org/standard?q=a&b=c "Official source"
