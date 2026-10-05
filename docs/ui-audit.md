# CREEP_LAB UI 审计报告

审计日期：2026-10-03 · 审计对象：`master @ 1979399` · 审计本身未改动任何源码（上表是其后修复工作的状态）

> **状态更新（2026-10-04）**：本报告列出的缺陷已逐条处理完毕。下表是每一条的当前状态与复核方式；下面的原始条目保留为当时的历史记录，**不再代表现状**。复核一律以测量为准，不是以"改过了"为准。
>
> | 条目 | 状态 | 复核证据 | 提交 |
> | --- | --- | --- | --- |
> | P0-1 深色主按钮 2.53:1 | ✅ 已修 | 浏览器实测：浅色 6.16:1、深色 7.34:1；`--on-green` 令牌已接线 | `80b64c3` |
> | P0-2 切换工作区丢工作 | ✅ 已修 | 实测参数 `35 → 切走 → 切回 → 35`；数据集 9 行与 Export CSV 均存活；3 条回归测试（其中 2 条验证过"打瘸 store 就会失败"） | `efb952e` |
> | P0-3 无 URL 状态 | ✅ 已修 | 实测 `?mode=docs&model=b4s&kernel=js` 打开 B4s；Back/Forward 在工作区间往返；刷新后参数、模型、内核全部保留；6 条路由测试 | `3dc6500` |
> | P1-1 锚点被页头盖住 | ✅ 已修 | 实测 `#formulas` 落在 97px（页头 65px），`scroll-margin-top: 88px` | `3fc0887` |
> | P1-2 字号下限失守 | ✅ 已修 | 下限提到 11px；逐属性 diff 证明只动了字号与随之而来的行高/字距，padding/gap/颜色/圆角零变化、元素数不变；390/768/1440/1800 四个宽度无页面级横向滚动 | `2e5462a` |
> | P1-3 强调色 3.94:1 用于 9px 标签 | ✅ 已修 | 强调色拆成图形与文字两值；实测浅色 5.53:1、深色 6.95:1；recharts 字号改由图表主题提供；对比度测试从令牌自行计算 | `45868ec` |
> | P1-4 异步结果不被朗读 | ✅ 已修 | 批量行数、内核对比耗时为 `role="status"`，解析失败为 `role="alert"`；测试删掉属性即失败 | `3fc0887` |
> | P2-1 切换模型静默清空数据集 | ✅ 已修 | 数据集改为携带并重算；B4→ACI 会问 6 个缺失列而不是丢文件；2 条测试 | `5a2ee73` |
> | P2-2 文案与本地化 | ✅ 已修（1 项转为记录） | 省略号、`translate="no"`、`autocomplete="off"` 均已落地并在浏览器核对；`en-US` 数字格式改为**有意保留**并写明理由（工程数值固定用小数点与千分位） | `8821ee8` |
> | P2-3 交互细节 | ✅ 已修 | `option` 显式配色、`touch-action`、`overscroll-behavior`、`safe-area-inset`、`text-wrap: balance`、提交按钮可聚焦并把光标移到出错字段——全部在浏览器逐项核对 | `8821ee8` `df37c86` |
>
> **复核中新发现的一项，已单独清扫完毕（2026-10-04）**：中文片段没有标 `lang="zh-CN"`，`<html lang="en">` 会让屏幕阅读器用英语音素念中文。静态 JSX 已就地包 `<span lang="zh-CN">`，数据来的字符串经 `<Lang>` 按字符类切分后标记；守护测试走查真实 DOM，覆盖三个工作区、命令面板、告警、映射面板、问题表与超限提示，任何含汉字的文本节点或 `aria-label`/`title`/`placeholder`/`alt` 都必须落在带 `lang="zh…"` 的元素内，且文本内容逐字符不变。详见 [`docs/bug-audit.md`](bug-audit.md)（N-18）。
>
> **审计中提到的其余结构债**（单行 JSX、无令牌层）已随第 1 步处理完毕：六个组件全部拆行，字号/圆角/图表尺寸均有令牌，`src/` 中不再有 `text-[Npx]` 字面量。

## 方法与证据等级

| 手段 | 覆盖 |
| --- | --- |
| 真实渲染探测（headless Chrome + DevTools Protocol） | 对比度、锚点滚动位置、字号分布、跨工作区状态、history 行为 |
| 对比度计算（WCAG 相对亮度公式） | 两套主题全部 12 组令牌配对 |
| 静态检查（grep + 逐文件阅读） | 规范合规项、结构债、信息架构 |
| 现有测试与截图脚本 | 93 测试 / ESLint / `npm run screenshots` 作为改造安全网 |

标注 **[实测]** 的结论来自真实浏览器渲染，不是推断。

改造后新增的复核手段：计算样式指纹（逐元素记录字体、字重、行高、字距、颜色、圆角、内边距、间距），以及令牌级对比度测试（`src/paletteContrast.test.js`，两套主题共 24 组**实际出现**的配对）。

---

## 1. 已证实的缺陷

### P0-1 · 深色模式主按钮对比度 2.53:1，远低于 AA 的 4.5:1 **[实测]**

```
渲染实测（dark）：color rgb(255,255,255) on background rgb(127,159,255) = 2.53:1  FAIL
```

`--primary` 在深色主题是浅蓝 `#7f9fff`，而 [index.css:122](src/index.css#L122) 把按钮文字硬编码成 `#fff`：

```css
.button-primary, .btn-primary { background: var(--primary); color: #fff; }
```

**讽刺的是正确令牌已经存在却从未被使用**：`--on-green` 在浅色是 `#fff`、在深色是 `#101412`（[index.css:37](src/index.css#L37) / [index.css:73](src/index.css#L73)），全仓 0 处引用。

同一根因还影响选中文本：[index.css:97](src/index.css#L97) `::selection { background: var(--primary); color: #fff; }`。

影响面：深色模式下每一个主 CTA（Calculate、Export CSV、Download template 等）以及全部文本选中态。
修法：两处 `#fff` → `var(--on-green)`。一行级改动，零风险。

### P0-2 · 切换工作区会静默丢弃用户的工作 **[实测]**

[App.jsx:24-26](src/App.jsx#L24-L26) 用条件渲染切换工作区，每个工作区的状态都是组件内部的 `useState`，切走即卸载：

```jsx
{activeMode === 'single' && <SingleCalculationDashboard />}
{activeMode === 'batch' && <BatchCalculator />}
{activeMode === 'docs' && <DocsPage />}
```

实测两幕：

| 操作 | 实测结果 |
| --- | --- |
| 批量页加载演示数据（结果矩阵 + Export CSV 已出现）→ 点 Reference → 回 Batch | `Export CSV` 消失，**数据集与全部结果丢失** |
| 单点页把相对湿度 70 改成 35 → 点 Batch → 回 Calculate | 输入框回到 **70**，编辑丢失 |

这不是边缘情况：批量页的典型用法就是"算完想去参考库核对一下公式再回来"。用户为此付出的代价是重新上传。
修法方向：状态提升到 App（或 store），或让工作区常驻挂载（`hidden` 而非卸载），配合下面的 P0-3。

### P0-3 · 完全没有 URL 状态 **[实测]**

```
工作区切换产生的 history 条目数：0
```

工作区、模型、引擎、参数、批量数据集全部是内存态：无法深链（"把 B4 文档页发给同事"做不到）、刷新即重置、浏览器后退直接离开应用、无法用后退在三个工作区之间往返。

### P1-1 · 参考库的目录锚点会被吸顶页头盖住 **[实测]**

```
点击「Applicability」锚点：#applicability 落到 top=12px，页头高 65px，scroll-margin-top: 0px → 标题被遮住
```

[DocsPage.jsx:407](src/components/DocsPage.jsx#L407) 的右侧目录用 `href="#id"`，而页头是 `sticky top-0`。全仓无 `scroll-margin-top` / `scroll-mt-*`。
修法：给锚点目标加 `scroll-mt-[80px]` 一类（或 `scroll-margin-top: calc(var(--header-h) + 1rem)`）。

### P1-2 · 字号下限失守：单页约 50 个文本节点渲染在 ≤9px **[实测]**

```
单点计算页实测字号分布（px: 元素数）
1(跳过链接): 41 | 8: 8 | 9: 33 | 9.1: 8 | 10: 13 | 11: 22 | 12: 18 | 12.7: 61
```

最小的两档集中在：`eyebrow` 标签（[index.css:111](src/index.css#L111) 定 10px，组件里进一步用 `text-[8px]` / `text-[9px]` 覆盖）、图表刻度与参考线标签（fontSize 9）、单位角标、`EQ 01` 序号、图表图例。

按文件统计 `text-[8px]`/`text-[9px]`/`text-[10px]` 出现次数：CalculatorWrapper 14、DocsPage 10、BatchCalculator 7、DynamicParameters 6、SingleCalculationDashboard 4、Header 3、Layout 1。

这不是合规问题（WCAG 不设最小字号），是**可读性问题**：8–9px 在非 Retina 屏和中文标签上基本不可读，而中文恰恰是这些标签的主要内容（"参数将在计算前进行范围校验"）。

### P1-3 · 强调色在浅色主题下 3.94:1，用于 9px 图表标签 **[实测计算]**

```
light: accent #c9532d on bg #f4f2ed = 3.94:1  → 仅够 AA-large/UI，不够正文
```

[CalculatorWrapper.jsx:140](src/components/ui/CalculatorWrapper.jsx#L140) 用它渲染 `t₀ 365d` 这种 9px 标签 —— 小字号 + 不足对比度，是最糟的组合。
其余 23 组令牌配对全部通过 AA（浅色 `text/bg` 14.89、深色 16.29；`success/warning/error` 均 ≥4.5）。

### P1-4 · 异步结果不被朗读

`aria-live` 全仓只有一处（[Header.jsx:79](src/components/ui/Header.jsx#L79) 的内核状态）。批量校验结果、结果矩阵出现、内核对比完成都是静默的——屏幕阅读器用户不知道发生了什么。
（`role="alert"` 的告示条是对的，见第 5 节。）

### P2-1 · 批量页切换模型会静默清空数据集

[BatchCalculator.jsx:161](src/components/BatchCalculator.jsx#L161) `resetForModel` 无条件清空结果、表头、问题与文件名，[BatchCalculator.jsx:198](src/components/BatchCalculator.jsx#L198) 直接绑在下拉框上。用户只是想换个模型试试，数据就没了，且无确认、无撤销。

### P2-2 · 文案与本地化细节

- 省略号用了三个点而非 `…`：[Aci209Calculator.jsx:37](src/components/Aci209Calculator.jsx#L37)、[Mc2010Calculator.jsx:39](src/components/Mc2010Calculator.jsx#L39)、[B4Calculator.jsx:90](src/components/B4Calculator.jsx#L90)、[B4sCalculator.jsx:76](src/components/B4sCalculator.jsx#L76)、[LoadingSpinner.jsx:5](src/components/LoadingSpinner.jsx#L5)
- 数字格式硬编码 `en-US`：`Intl.NumberFormat('en-US')` 与 `toLocaleString('en-US')` —— 界面主体是中文时仍按美式分组
- 双语界面没有 `translate="no"`：品牌名、模型名（ACI 209R-92）、参数名可能被浏览器自动翻译弄乱
- 数值输入缺 `autocomplete="off"`（[DynamicParameters.jsx:59](src/components/ui/DynamicParameters.jsx#L59) 已有 `type="number"`/`inputMode` ✓）

### P2-3 · 若干交互细节

- 原生 `<select>` 为 `bg-transparent`（[CustomSelect.jsx:12](src/components/ui/CustomSelect.jsx#L12)），Windows 深色模式下选项列表可能不可读（规范要求显式 `background-color`/`color`）
- 无 `touch-action: manipulation`（移动端双击缩放延迟）、滚动容器无 `overscroll-behavior: contain`（结果表滚到底会把整页带着滚）
- manifest 声明 `display: standalone`，但布局未用 `env(safe-area-inset-*)`：安装成 PWA 后刘海屏会压住页头
- 长标题无 `text-wrap: balance`（"Time-dependent concrete analysis" 在窄屏出现孤字）
- 提交按钮**预先禁用**（[DynamicParameters.jsx:128](src/components/ui/DynamicParameters.jsx#L128) `disabled={!calculateReady || invalidCount > 0}`）：禁用按钮不可聚焦，键盘用户无法通过它得知原因；且校验失败时不把焦点移到第一个出错字段

---

## 2. 规范合规明细（Vercel Web Interface Guidelines）

```text
## src/index.css

index.css:122 - .button-primary 硬编码 color:#fff → 深色主题 2.53:1，应使用 var(--on-green)
index.css:97  - ::selection 同样硬编码 #fff
index.css:37,73 - --on-green 两套主题均已定义但零引用（死令牌）
index.css:111 - .eyebrow 定 10px，组件再压到 8–9px；建议建立字号下限令牌
index.css     - 缺 scroll-margin-top（锚点被吸顶页头遮挡）
index.css     - 缺 touch-action: manipulation、overscroll-behavior: contain

## src/App.jsx

App.jsx:24-26 - 工作区条件渲染 → 切换即卸载，用户状态丢失（见 P0-2）
App.jsx:12    - activeMode 仅存于 useState，无 URL 同步（见 P0-3）

## src/components/DocsPage.jsx

DocsPage.jsx:407 - 目录锚点 href="#id"，目标无 scroll-margin-top → 标题被页头遮挡
DocsPage.jsx:407 - 目录仅在 2xl（≥1536px）可见，绝大多数用户看不到
DocsPage.jsx     - 10 处 text-[8px]/[9px]/[10px]

## src/components/BatchCalculator.jsx

BatchCalculator.jsx:161 - resetForModel 无确认/撤销地清空数据集（破坏性操作）
BatchCalculator.jsx:198 - 模型下拉直接触发上述清空
BatchCalculator.jsx:232 - 校验结果表出现时无 aria-live 通知
BatchCalculator.jsx:232 - 滚动容器缺 overscroll-behavior: contain

## src/components/ModelCalculator.jsx

ModelCalculator.jsx - 内核对比完成无 aria-live（结果只出现在可视区）

## src/components/ui/DynamicParameters.jsx

DynamicParameters.jsx:59  - 数值输入缺 autocomplete="off"
DynamicParameters.jsx:128 - 提交按钮预先禁用；出错时不聚焦首个无效字段
DynamicParameters.jsx     - 6 处 text-[8px]/[9px]/[10px]

## src/components/ui/CalculatorWrapper.jsx

CalculatorWrapper.jsx:140 - 9px 图表标签用 var(--accent)，浅色仅 3.94:1
CalculatorWrapper.jsx     - 14 处 text-[8px]/[9px]/[10px]（全仓最密集）
CalculatorWrapper.jsx     - 数字列已用 font-mono（等宽即表格数字 ✓），但混排处无 tabular-nums

## src/components/ui/CustomSelect.jsx

CustomSelect.jsx:12 - select 无显式 background-color（Windows 深色模式风险）

## src/components/Aci209Calculator.jsx / Mc2010Calculator.jsx / B4Calculator.jsx / B4sCalculator.jsx

Aci209Calculator.jsx:37  - "Loading Rust ACI209 WASM Module..." → …
Mc2010Calculator.jsx:39  - "Loading Rust fib MC2010 WASM Module..." → …
B4Calculator.jsx:90       - "Loading Rust RILEM B4 WASM Module..." → …
B4sCalculator.jsx:76      - "Loading Rust RILEM B4s WASM Module..." → …

## src/components/LoadingSpinner.jsx

LoadingSpinner.jsx:5 - "Loading..." → "Loading…"

## src/components/ui/Header.jsx

Header.jsx:79 - ✓ 内核状态 role="status" + aria-live
Header.jsx:82 - ✓ 主题切换按钮有 aria-label
Header.jsx    - 3 处 text-[9px]
```

---

## 3. 信息架构与交互评估（本次重做的主战场）

### 3.1 导航模型

| 问题 | 说明 |
| --- | --- |
| 无路由 | 三个工作区是内存态，无深链、无后退、刷新即回 Calculate（P0-3） |
| 状态不跨区 | 模型、引擎、参数、数据集各自为政，切换即丢（P0-2） |
| 无全局检索 | 4 模型 × 2 引擎 × 3 工作区，找"B4 的干燥收缩公式"只能靠翻页 |
| 无命令面板 | 高频动作（换模型、换引擎、跑对比、导出）没有统一入口；现在只有 ⌘↵ 一个快捷键 |
| 移动端隐藏式交互 | 模型选择器与文档模型列表都是横向滚动条（[SingleCalculationDashboard.jsx:45](src/components/SingleCalculationDashboard.jsx#L45)），无滚动提示、无边缘渐隐，用户不知道右边还有内容 |
| 批量三步指示器不可点 | 01 Upload / 02 Validate / 03 Results 是装饰性的，不能点击回退 |

### 3.2 单点计算

- **21 个参数一个粘性长列**（B4）：6 个分组里 Time/Geometry/Material 全展开，用户要在 1000px+ 的滚动里找 `wC`。缺：分组折叠记忆、常用参数置顶、"仅显示必填"模式
- **无参数集保存/加载**：调好一组配合比无法存名、无法导出 JSON、无法在两次运行间对比
- **无单位制切换**：ACI 209R-92 是美制报告，界面只给 mm/MPa/%；工程上常需要 psi/in
- **结果与参数的关系不可见**：改参数后结果标 "Results out of date"，但不显示"改了哪几个、从多少到多少"；也无 before/after 双曲线
- **无可复制的数值**：指标数字是纯文本，没有复制按钮（工程上要把 φ 值贴到计算书里）
- **引擎选择藏在参数列底部**，而它是全局语义；批量页则完全没有引擎概念（见下）

### 3.3 批量

- **引擎不对称且未说明**：[BatchCalculator.jsx](src/components/BatchCalculator.jsx) 直接 import JS 内核，批量永远走 JS；界面上没有任何说明，用户会以为批量也用了 WASM
- **单向向导**：上传 → 校验 → 结果，没有"回到上一步改映射列"的路径（列名不匹配只能改文件重传）
- **列映射缺失**：要求列名与 schema 逐字相同（`wC`、`tPrime`、`cementType`…），没有"把 CSV 的 `w/c` 映射到 `wC`"的界面
- **无失败行重试**：问题行只能看，不能就地修正后重算
- **图表是事后检查**：X/Y 轴选择器在结果区底部，默认 `t` vs 第一个输出列，没有"按参数分组着色"

### 3.4 参考库

- 目录导航 ≥1536px 才出现（[DocsPage.jsx:407](src/components/DocsPage.jsx#L407)）
- 四个模型是四份独立长文档，无检索、无锚点互跳、无"与上一版差异"
- 公式区块用 KaTeX 静态渲染 ✓，但无"复制 LaTeX"、无"符号表"
- 中文说明只有下载入口（`Markdown 说明` 按钮），没有站内中文视图——中文用户在英文长文档里找信息

### 3.5 跨区一致性

- "结果失效"语义只在单点页有；批量页改了模型直接清空（更粗暴）
- 内核状态徽标只在页头，而它与单点页的引擎选择、批量页无关，语义含糊
- 内核对比面板（性能话题）放在工程结果列里，和 φ 值并列——受众混淆：工程师关心 φ，开发者关心 ms

---

## 4. 阻碍视觉改造的结构债

这一层不先处理，后面每次调样式都要和它搏斗。

| 问题 | 证据 | 影响 |
| --- | --- | --- |
| **超长单行 JSX** | [CalculatorWrapper.jsx:142](src/components/ui/CalculatorWrapper.jsx#L142)、[BatchCalculator.jsx:232](src/components/BatchCalculator.jsx#L232)、[DocsPage.jsx:400](src/components/DocsPage.jsx#L400) 单行 300–900 字符、内联十几个 Tailwind 类 | 无法 diff、无法局部重构、改一个间距要在巨行里做手术 |
| **令牌层不完整** | 有颜色令牌 ✓，但无字号/间距/圆角尺度令牌；`text-[8px]`…`text-[13px]` 全是硬编码；圆角在组件里散落 `rounded-[7px]`/`rounded-lg`/`rounded-md` | 改视觉方向要逐文件改几十处字面量 |
| **死令牌** | `--on-green` 定义两套主题、零引用；`--trace-glow: transparent` 疑似遗留 | 令牌层不可信 |
| **自建类语义过载** | `.workbench-panel` 同时承担卡片/容器/分节三种角色；`.eyebrow` 同时是标签、表头、序号 | 无法按角色分别调整 |
| **图表主题化靠 `!important` 覆盖** | [index.css:165-167](src/index.css#L165-L167) 覆盖 recharts 内部类名 | recharts 升级即碎 |
| **字体走 Google CDN** | [index.html:17](index.html#L17) 单个 `fonts.googleapis.com` 请求，无 `preconnect`、无自托管 | 离线/内网直接掉字体（与"本地优先"定位冲突）；字体到达前有 FOUT |
| **组件与文档强耦合** | DocsPage 内嵌 4 个模型的 300+ 行硬编码数据 | 改版式要穿过大段数据 |

---

## 5. 已经达标的部分（不要重做）

审计要公平：下面这些是真的做对了，重做时应当保留。

- **`prefers-reduced-motion` 全局处理**（[index.css:169](src/index.css#L169)）：动画/过渡/滚动行为统一降级 ✓
- **全局 `:focus-visible` 焦点环**（[index.css:93](src/index.css#L93)）2px + offset，键盘可见 ✓
- **跳过链接 + 语义化元素**：全仓无 `<div onClick>`，交互一律 `<button>`/`<a>`/`<label>` ✓
- **表单标签绑定**：`htmlFor` + `id` 全通 ✓；复合控件用 `:focus-within` 给整组焦点态 ✓
- **主题基础设施**：`color-scheme` 随主题切换 ✓、`<meta name="theme-color">` 动态更新 ✓、首屏内联脚本避免主题闪烁 ✓
- **图表有无障碍替代**：AnalysisChart 的 Data 标签页提供等价表格 ✓（且明示"显示 N / 共 10001 点，导出含全部"）
- **大列表已设上限**：批量矩阵与问题表各限 100 行并显式说明，图表按 10 步采样 ✓
- **对比度**：24 组令牌配对里 23 组过 AA（唯一例外见 P1-3）
- **无 `transition: all`、无 `autoFocus`、无 `user-scalable=no`、无图片尺寸问题**（界面内无 `<img>`）✓
- **改造安全网**：93 个测试 + ESLint + 一键重出全部截图（`npm run screenshots`）✓

---

## 6. 建议的重做顺序

按"先地基、后表达"排，每步都能独立验收：

1. **地基（无视觉变化）**：拆超长 JSX → 补全令牌（字号/间距/圆角尺度）→ 修 P0-1/P1-1/P1-4 → 状态提升修 P0-2 → 加路由修 P0-3。此时测试与截图应几乎不变（除深色按钮）。
2. **信息架构**：工作区常驻 + URL 状态 + 全局命令面板 + 批量列映射 + 参数集保存/加载。
3. **视觉方向**：用 `frontend-design` 出 2–3 稿（此时令牌层已就绪，换方向是改变量而不是改 60 个文件）。
4. **手感与动效**：`emil-design-eng` 做组件级细节，`apple-design` 做过渡与手势，`animation-vocabulary` 用于沟通。
5. **验收**：`web-design-guidelines` 复审 + 对比度复算 + 四宽度截图重出。

对应 skill：第 1–2 步主要靠工程（无 skill 覆盖），第 3–5 步正好是本会话已有的 5 个 skill。

---

## 7. 决策记录（已定）

| # | 决策 | 结论与理由 |
| --- | --- | --- |
| 1 | P0-1 是否立即修 | **立即单独修**，先于整个重做。一行级改动、收益明确、零风险，没有理由让它等。 |
| 2 | 工作区常驻 vs 状态提升 | **状态提升（store）**。工作区常驻（`hidden` 代替卸载）改动更小，但会把三个工作区同时挂在内存里，也解决不了"刷新即丢失"；重做要上路由，而路由本身就需要状态提升，所以直接做后者。 |
| 3 | 是否做 SI/US 双单位制 | **本轮不做，但把单位变成显式数据**。① 四个模型的官方公式各自以特定单位表述（ACI 报告为美制，MC2010/B4 为 SI），实现层已统一到 SI（mm/MPa），现在引入美制会同时触及参数面板、结果读数、批量 schema、文档公式说明四层；② 单位换算是纯展示层问题，可在不触碰内核的前提下后加——参数面板已有 `unit` 字段（如 `{ name:'H', unit:'%' }`），结构化即可；③ 因此本轮保持 SI，先把 `unit` 结构化留门，双单位作为独立特性排到重做之后。 |

本报告本身按推荐提交进仓库，作为重做的基线文档。
