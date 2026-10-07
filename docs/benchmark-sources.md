# Benchmark 文献清单（开放获取优先）

目标：给四个模型的内核配"已发表数值"复现——每条 = 文献引用（外链）+ 输入 + 发表值 + 内核值 + 相对差/口径说明，
对应一条 vitest 钉死。**只收录开放获取；不收全文 PDF 进仓库，只放引用与链接。**

状态记号：✅ 已有数值可用 · 🔍 候选（待翻到具体数值页） · 🧪 已在仓库复现

## ACI 209R-92

| 文献 | 获取 | 可复现数值 | 状态备注 |
| --- | --- | --- | --- |
| ACI 209R-92 报告正文（ACI 官方） | 付费；`concrete.org` 官方页 id/5089 | 标准值（$\phi_u=2.35$、$\varepsilon_{shu}=780\mu\varepsilon$ 等） | 引用以官方为准；数值从下面开放来源核对 |
| ACI 209R-92 非官方镜像（`civilwares.free.fr/ACI/MCP04/209r_92.pdf`、`pdfcoffee`） | 开放但灰色 | 同上，含修正系数表与例题 | 仅用于数值核对，不作为引用源 |
| Auburn / ALDOT 930-373-1《Camber and Prestress Losses in HPC Bridge Girders》(`eng.auburn.edu/files/centers/hrc/930-373-1.pdf`) | .edu 开放 | Table 6.1 材料几何参数、Table 6.2 用 ACI 209R-92 算出的修正系数（H=70%） | 🧪 已复现：蠕变列逐因子对拍（湿度/空气精确一致，坍落/细骨料到印刷精度，`src/math/aciAuburnFactors.test.js` 6 组断言）；收缩列超出内核范围（creep-only，见 DocsPage），V/S 为反推值已注明 |
| WSDOT《Precast, Prestress Bridge Girder Design Example》§6.4.1（`wsdot.wa.gov/.../Design_Example.pdf`） | 州政府开放 | §6.4.1 徐变系数的逐步计算 | 🔍 需先确认该例用的是哪套模型口径（AASHTO/PCI 或 ACI 209）再立项 |

## fib Model Code 2010

| 文献 | 获取 | 可复现数值 | 状态备注 |
| --- | --- | --- | --- |
| SOFiSTiK 2025 验证手册 DCE-MC1 §38.4（`docs.sofistik.com/.../dce-mc1.pdf`） | 开放 | $\phi=1.385+0.2587=1.64$ 及各分量（p.320） | 🧪 已复现（内核 1.6452 一致；`/1.05` 是切线模量报告口径，不进内核，见 `bug-audit.md`） |
| `structuralcodes` MC2010 模块（`fib-international.github.io/structuralcodes`，测试） | 开源 MIT | `phi/phi_bc/phi_dc` 测试值 | 🧪 已逐条对拍一致 |
| fib Bulletin 65（MC2010 初版两卷，fib 官网免费文档区） | 开放 | 公式原文 | 口径依据，非数值 |
| Tošić 2019 博士论文（`upcommons.upc.edu` 开放下载） | 开放 | RAC 收缩/徐变统计，模型偏差分布 | 分布级，适合做容差带而非单点钉死 |

## B4 / B4s

| 文献 | 获取 | 可复现数值 | 状态备注 |
| --- | --- | --- | --- |
| Bažant 实验室系列论文（`civil.northwestern.edu/people/bazant/PDFs/Papers/` P225/P551/P552/P596） | 作者官网开放 | B4 参数表、水泥/外加剂/骨料表 | ✅ 与内核查表逐位核对过（见 `bug-audit.md` N-19 两份独立来源） |
| RILEM TC-242-MDC 推荐文本（`upcommons.upc.edu` 开放 PDF；期刊版 DOI `10.1617/s11527-014-0485-2` 付费） | 开放版可用 | §1.9 基准（自生项加号口径，$-36.97\mu\varepsilon$） | 🧪 已钉死；期刊引用以 DOI 为准 |
| IIT Madras 学位论文 Tables 2.1–2.6（RILEM 表逐表复现） | 学位论文开放 | `ε_au,cem = 210 / −84 / 0 ×10⁻⁶`（R/RS/SL）等全套查表值 | 🧪 已逐位验证（N-19） |
| Auburn / ALDOT 930989（`eng.auburn.edu/files/centers/hrc/aldot-930989-final1.pdf`）Table 3-5/3-6/3-7 | .edu 开放 | B4 水泥徐变参数表、收缩参数表、骨料表 | 🧪 已复现：三表全部共享格与内核逐位一致（`src/math/b4AuburnTables.test.js` 12 组断言；报告 p.40/42），内核额外 `No Information` 为应用侧默认值 |
| NU 数据库 Revamp（Zenodo `zenodo_8150176`，1400+ 徐变 / 1800+ 收缩曲线） | 开放数据 | 整库曲线，可做批量容差复现 | 数据量大，适合做"批量容差带"而非单点 |
| B4s 专用开放例题 | 暂缺 | — | B4s 与 B4 共用参数表；独立 B4s 数值例仍在找，有即补 |

## 复现流程（立项后每条照此办）

1. 临时 vitest 在真实内核上跑出数，记录发表值 vs 内核值 vs 相对差；
2. 差值解释不清先查口径（参考 N-20 的 `/1.05`），口径差不进内核，只写进测试注释与文档；
3. 转正为 `src/**/__benchmarks__` 或既有 `*.test.js` 里的命名断言（如 `TANGENT_MODULUS_RATIO`），并在 `DocsPage` 的 Benchmarks 节登记引用与链接。
