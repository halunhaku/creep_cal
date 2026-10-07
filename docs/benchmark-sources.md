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

## GL2000（已实现单点 + 批量 + 文档 + Rust）

| 文献 | 获取 | 可复现数值 | 状态备注 |
| --- | --- | --- | --- |
| Gardner & Lockman 2001 原文（ACI Materials J. 98(2):159–167） | 付费 | 公式源头 | 引用以此为准；方程与数值从下面开放来源取 |
| Gardner 比较论文附录 GL2000（CJCE，由用户提供，未进仓库） | 用户自有，与 R21 附录 A.4 同源 | [A3] 强度发展、[A5][A6] 徐变全式、K=1/0.75/1.15、Φ 分段式 | ✅ 终审：[A6] 括号结构、εshu 取 900、II 型 K 取 0.75 皆以此为准；C.4 徐变表与其不符，维持证伪 |
| Auburn ALDOT 930989 §3.2.8（Eqs. 3.182–3.191）+ §7.11 + Table 7-8 | .edu 开放 | 全套方程（E/徐变/收缩）+ 本项目配合比输入 + §7.11 预测曲线 | 结构与 Gardner 一致，但干燥尺寸常数误抄为 97（英制→0.150/mm²，真值 0.12），用时以 Gardner 为准；源用英制，实现时转 SI |
| VTRC 04-CR1 收缩方程节（`rosap.ntl.bts.gov/dot/19607`，政府开放） | 开放 | GL2000 收缩三式 + VDOT 配合比与 180 天实测 | 收缩侧第二来源（方程结构与指南一致）；εshu 系数印 1000，与 C.4.3 实算的 900 矛盾，以后者为准 |
| Al-Manaseer & Prado 2015（作者 SJSU 主页开放 PDF） | 开放 | 六模型统计排名 + 适用域表（GL2000：fcm 16–82 MPa，H 20–100%，I/II/III 水泥） | 分布级；密封试件 GL2000 按 96% RH 计（别家 98–100%），批量时注意 |
| GL2000 收缩半内核（`gl2000Shrinkage`，C.4.3 验证） | 本仓库实现 | C.4.3 六行中五行吻合（t=90 行按公式取 158，舍弃印刷的 139，证明见测试头注） | 🧪 已转正（`src/math/gl2000Shrinkage.test.js` 13 组断言） |
| GL2000 徐变半内核（`gl2000Compliance`，[A6] 实现） | 本仓库实现 | C.4.4 弹性链精确（Ecm28=28014、Ecmto≈26371、J=37.92e-6）+ 结构性质（零点/单调/Φ/96% 设计零点） | 🧪 已转正（`src/math/gl2000Compliance.test.js` 12 组断言）；全曲线数值目标仍缺（C.4 徐变表已证伪），属已知缺口 |
| ACI 209.2R-08 C.4 GL2000 worked example（Bažant 官网 R21.pdf p.41–42） | 开放但**徐变表不可用，收缩表可用** | 收缩六行中五行吻合 | ❌ 徐变硬伤：子项各自精确（T1、T_age·T_7 逐格吻合）但组合成和而非积、漏掉干燥项、Φ 印 0.961（例内 tc=7、V/S=100 时公式给 0.9318）、βs 印 0.933（实算只能是 0.8705）；收缩 t=90 行（0.224/139）与其余五行不自洽，正确值应为 0.254/158 |

## AASHTO LRFD（已实现单点 + 批量 + 文档）

| 文献 | 获取 | 可复现数值 | 状态备注 |
| --- | --- | --- | --- |
| FHWA-HRT-05-057 Appendix D（`fhwa.dot.gov/.../05057/appd.cfm`，HTML 全文） | 美国政府开放 | 5.4.2.3/5.4.2.4 条文全文：徐变 ψ=1.9·ks·khc·kf·ktd·ti^-0.118，收缩 εsh=ks·khs·kf·ktd·0.48e-3 | 🧪 已转正（`src/math/aashtoFactors.test.js` 13 组断言：校准锚点精确 + 结构性质 + 1.2 规则）；加速养护 ti 折算未实现，已注明 |
| Auburn ALDOT 930989 §3.2.1（Eqs. 3.1–3.8）+ §7.2 + Figure 7-7 | .edu 开放 | 同套方程文字版 + 本项目预测曲线 | 第二转录源；注意源用英制（KSI/inch），实现时转 SI |
| WSDOT 设计备忘 07-2020（`wsdot.wa.gov/.../07-2020.pdf`） | 州政府开放 | 平衡悬臂桥修正徐变式（含 worked 常数） | 参考：节段桥修正口径，与标准式不同，不混用 |
| Al-Manaseer & Prado 2015（同上） | 开放 | AASHTO 2012 六模型垫底排名（收缩与徐变皆最末） | 分布级参考；选型时诚实告知精度预期（已写入 DocsPage 限制） |

## 复现流程（立项后每条照此办）

1. 临时 vitest 在真实内核上跑出数，记录发表值 vs 内核值 vs 相对差；
2. 差值解释不清先查口径（参考 N-20 的 `/1.05`），口径差不进内核，只写进测试注释与文档；
3. 转正为 `src/**/__benchmarks__` 或既有 `*.test.js` 里的命名断言（如 `TANGENT_MODULUS_RATIO`），并在 `DocsPage` 的 Benchmarks 节登记引用与链接。
