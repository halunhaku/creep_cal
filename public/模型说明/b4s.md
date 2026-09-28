# RILEM Model B4s 混凝土强度简化徐变与收缩模型说明

本项目严格实现 **RILEM TC-242-MDC (2015) §1.8** 正式推荐的 **Model B4s** 强度简化预测模型（*Materials and Structures* 48(4):753–770）。

Model B4s 是针对初步设计或配合比尚未敲定时，仅根据混凝土 28 天抗压强度 $f_c$ 与宏观环境参数估算徐变与收缩的简化公式。

---

## 1. 输入参数与适用范围

| 界面含义 | 批量列名 | 单位 | 校准有效范围 | 说明 |
| --- | --- | --- | --- | --- |
| 开始干燥龄期 | `t0` | d | `t0 ≥ 1` | 脱模开始干燥的龄期 |
| 加载龄期 | `tPrime` | d | `tPrime ≥ 1` | 开始施加单轴压应力的龄期 |
| 养护期温度 | `Tcur` | °C | `20 ≤ Tcur ≤ 30` | 养护阶段温度 |
| 干燥期温度 | `Tsh` | °C | `-25 ≤ Tsh ≤ 75` | 干燥阶段环境温度 |
| 受荷期温度 | `Tc` | °C | `-25 ≤ Tc ≤ 75` | 受荷阶段环境温度 |
| 相对湿度 | `h` | % 或 0–1 | `0 ≤ h ≤ 100` | 环境相对湿度 |
| 28d圆柱体平均抗压强度 | `fc` | MPa | `15 ≤ fc ≤ 70` | 28天实测圆柱体平均强度 |
| 体积表面积比 | `vS` | mm | `12 ≤ vS ≤ 120` | 构件 $V/S$；有效厚度 $D = 2V/S$ |
| 水泥水化活性 | `cementType` | - | `R`, `RS`, `SL` | `R`（普通）、`RS`（快硬）、`SL`（慢硬） |
| 骨料类型 | `aggregateType` | - | Table 6 | 见骨料系数表 |
| 试件形状系数 | `specimenShape` | - | `1`–`5` | 1=平板, 2=圆柱体, 3=方柱, 4=球体, 5=立方体 |
| 计算龄期 | `t` | d | `t ≥ 0` | 从浇筑起算的目标总龄期 |

---

## 2. 简化缩放公式 (Eqs. 44–52, Tables 7–9)

$$q_2 = \frac{s_2}{1\text{ GPa}}\left(\frac{f_c}{40}\right)^{s_{2f}}$$

$$q_3 = s_3 q_2 \left(\frac{f_c}{40}\right)^{s_{3f}}$$

$$q_4 = \frac{s_4}{1\text{ GPa}}\left(\frac{f_c}{40}\right)^{s_{4f}}$$

$$q_5 = \frac{s_5}{1\text{ GPa}}\left(\frac{f_c}{40}\right)^{s_{5f}}\left|k_h \varepsilon_{sh\infty}\right|^{p_{5\varepsilon}}$$

$$\tau_0 = \tau_{s,cem}\left(\frac{f_c}{40}\right)^{s_{\tau f}}$$

$$\varepsilon_0 = \varepsilon_{s,cem}\left(\frac{f_c}{40}\right)^{s_{\varepsilon f}}$$

### 参数表 (Table 9)

- R 类水泥：$s_2 = 14.2\times 10^{-3}$, $s_3 = 0.976$, $s_4 = 4.00\times 10^{-3}$, $s_5 = 1.54\times 10^{-3}$, $s_{2f} = -1.58$, $s_{3f} = -1.61$, $s_{4f} = -1.16$, $s_{5f} = -0.45$。

注：原文 §1.9 算例数值行打印的 $q_4 = 6.9 \times 10^{-3}$ 为该算例排版打印差异，规范 Table 9 统一规定 $s_4 = 4.00\times 10^{-3}$。本项目严格遵循 Table 9 官方规范参数定义。

---

## 3. 官方参考文献

- **Bažant, Z. P., Jirásek, M., Hubler, M. H., & Carol, I. (2015).** *RILEM draft recommendation: TC-242-MDC...* **Materials and Structures**, 48(4), 753–770. [DOI: 10.1617/s11527-014-0485-2](https://doi.org/10.1617/s11527-014-0485-2)
