# HALUNHAKU Design System

> CREEP_LAB 的界面契约。实现源为 `src/index.css`、`tailwind.config.js` 与 `src/components/chartTheme.js`；本文定义它们必须表达的语义，而不是另一套平行样式。

## 1. 设计目标

HALUNHAKU 是一套 **Scientific Workbench** 设计语言：像工程仪器，不像营销页。

1. **数据优先**：输入、单位、结果和适用范围先于装饰。
2. **语义优先**：令牌按用途命名，不按色相命名。蓝色是 action，橙色是 reference；不得新增 `green`、`amber`、`blue` 一类业务令牌。
3. **密度可控**：桌面允许紧凑，320px 起仍必须完整、可读、可操作。
4. **状态明确**：计算、失效、错误、警告、成功不能只靠颜色表达。
5. **渐进披露**：高级模型说明、模板和批量 schema 默认不抢占主任务空间。
6. **无装饰性动效**：动效只解释状态变化，并尊重 reduced motion。

## 2. 令牌

### 2.1 颜色

| 语义 | CSS 令牌 | Light | Dark | 用途 |
| --- | --- | --- | --- | --- |
| Canvas | `--bg` | `#f4f2ed` | `#101412` | 页面底色 |
| Surface | `--surface` | `#fffefb` | `#171d1a` | 主面板 |
| Inset | `--surface-2` | `#eceae4` | `#202724` | 表格、输入分组 |
| Raised inset | `--surface-3` | `#e4e7e3` | `#27302c` | 分段控件、次级层级 |
| Text | `--text` | `#17201d` | `#f2f0e9` | 正文与主标题 |
| Muted text | `--text-muted` | `#303a35` | `#bcc5c0` | 次要正文 |
| Faint text | `--text-faint` | `#3f4944` | `#a4aea9` | 标签与辅助信息 |
| Action | `--action` | `#2457d6` | `#7f9fff` | 主按钮、链接、焦点、选中态 |
| Action hover | `--action-hover` | `#1947bc` | `#9bb4ff` | Action hover |
| Action soft | `--action-soft` | `#e9eefc` | `#202d52` | 选中背景 |
| Action border | `--action-border` | `#aebff2` | `#425b9a` | Action 弱边框 |
| On action | `--on-action` | `#ffffff` | `#101412` | Action 实心背景上的文字 |
| Reference | `--reference` | `#c9532d` | `#f18a5b` | 图表参考线与第二数据系列 |
| Reference text | `--reference-text` | `#b34420` | `#f18a5b` | Reference 文本标签 |
| Reference soft | `--reference-soft` | `#f9e9e2` | `#3b251d` | Reference 弱背景 |
| Success | `--success` | `#1f6b48` | `#62b68b` | 成功状态 |
| Warning | `--warning` | `#7a4900` | `#d8a550` | 警告状态 |
| Error | `--error` | `#b42318` | `#eb776d` | 错误状态 |

规则：

- 正文对比度必须达到 WCAG AA 4.5:1；非文本图形和控件边界至少 3:1。
- `--reference` 负责图形，`--reference-text` 负责小字号文字，不能互换。
- Success / warning / error 必须同时有文字、图标或结构提示，不能只换颜色。
- 图表数据系列只使用 `--series-1`、`--series-2`、`--series-3`；组件不得借用 action 令牌绘制数据。

### 2.2 字体与数字

| 角色 | 字体 | 字重 | 尺寸 |
| --- | --- | --- | --- |
| UI / 正文 | Hanken Grotesk | 400–700 | 14–15px |
| 工程数据 / 控件 | Azeret Mono | 400–700 | 11–13px |
| 页面标题 | Hanken Grotesk | 700 | 28px |
| 主指标 | Azeret Mono | 600–700 | 27–32px |

- 两套字体必须本地打包；运行时不得依赖 Google Fonts。
- 数值、单位、表头和图例使用 `tabular-nums lining-nums`。
- 正文最小 14px；只允许单位、chip、表头、公式编号降到 11px。
- 工程数值固定使用小数点与英文千位分隔，不跟随系统 locale。
- 截断必须使用省略号字符 `…`，不使用三个句点。

### 2.3 空间与尺寸

以 4px 为基准网格：

| 角色 | 值 |
| --- | --- |
| 微间距 | 4 / 6px |
| 控件内部与同组间距 | 8px |
| 字段间距 | 12px |
| 面板内边距 | 16 / 20px |
| 区段间距 | 20 / 24 / 32px |
| 页头高度 | 64px |
| 普通按钮 | 40px |
| 输入控件 | 42px |
| 触屏核心目标 | 至少 44 × 44px |

紧凑控件可以低于 44px，但必须位于有明确间隔的密集数据区域；主操作、图标按钮、上传和导航不得使用该例外。

### 2.4 圆角、边框与阴影

- 输入与按钮：6px。
- 品牌标记：7px。
- 面板：10px；大型浮层：12px。
- 所有结构边界使用 1px `--line` / `--line-strong`。
- 普通面板不加阴影；阴影只用于浮层和命令面板。
- 不使用胶囊形容器承载普通文案或操作；pill 只用于状态标签。

## 3. 组件契约

### 按钮

- Primary：`.button-primary` / `.btn-primary`，仅用于每一区域的主动作。
- Secondary：`.button-secondary` / `.btn-secondary`。
- 必须覆盖 default、hover、active、focus-visible、disabled、loading。
- 图标按钮必须有 `aria-label`；loading 文案使用 `…`，并保持按钮宽度稳定。

### 字段

- 可见 label 与控件必须建立 `htmlFor` / `id` 关联。
- 文本输入必须定义 `name` 与合适的 `autocomplete`。
- `.field-control` 负责边框、背景和 `:focus-within`；内部 input/select 可以清除原生 outline，但外层焦点环不得消失。
- 校验错误要靠近字段，首个错误字段必须可聚焦。

### 面板与披露

- `.workbench-panel` 是主结构；`.card` 是同层卡片；`.surface-inset` 是内部数据层。
- `details/summary` 用于高级说明和模板，summary 必须有 focus-visible 状态。
- 不嵌套超过三层 surface；层级优先由标题、间距和边框表达。

### 表格与结果矩阵

- 表头、单位与数值使用 mono；数值右对齐并使用 tabular nums。
- 宽表必须在自己的可聚焦 region 内横向滚动，提供可访问名称和键盘滚动提示。
- 冻结行号或主键列；页面本身不得产生横向滚动。
- 空、错误、处理中和成功状态必须有明确文案。

### 图表

- 所有 Recharts 样式从 `src/components/chartTheme.js` 获取。
- 网格弱于数据线；reference line 使用 reference 图形令牌，标签使用 reference text。
- Tooltip、轴标题、图例不得低于 11px；只靠 hover 暴露的信息必须同时可通过键盘或表格读取。

## 4. 响应式行为

| 范围 | 契约 |
| --- | --- |
| 320–379px | 最小支持宽度；单列；页头压缩；模型选择横向吸附；高级内容折叠 |
| 380–639px | 单列移动布局；完整品牌标记；结果卡可换行 |
| 640–767px | 字段可双列；批量上传与映射仍优先纵向 |
| 768–1023px | 双列工作区；文档导航按空间决定 sticky 或折叠 |
| ≥1024px | 主工作台与结果并排；侧栏 sticky |
| ≥1280px | 使用完整数据密度；内容最大宽度 1540px |

通用不变量：

- `html` / `body` 最小宽度 320px。
- 任意支持宽度必须满足 `document.documentElement.scrollWidth === innerWidth`。
- Sticky 元素必须避开 64px 页头；锚点使用统一 scroll margin。
- 状态、输入和计算结果在工作区切换与浏览器 Back/Forward 后保持。

## 5. 交互、动效与可访问性

- 所有交互必须可通过键盘完成；原生 `button` / `a` / `input` 优先。
- 全局 focus-visible 为 2px action outline + 2px offset；任何 `outline-none` 必须有同级替代焦点样式。
- Async 结果使用 `role="status"`；失败使用 `role="alert"`。
- 中英文混排：页面基准 `lang="en"`；中文片段标 `lang="zh-CN"`。
- 点击反馈 100ms；颜色和边框过渡 140ms；进入动效 180ms。
- 禁止 `transition: all`；只过渡发生变化的属性。
- `prefers-reduced-motion: reduce` 下禁用滚动与装饰性动画。
- 可滚动面板使用 `overscroll-behavior: contain`；触控控件使用 `touch-action: manipulation`。
- 主题切换必须同步 `color-scheme`、`theme-color`、表单控件和图表颜色。

## 6. 文案与状态

- 标题说明用户当前任务；按钮使用动词，如 Calculate、Export CSV、Load demo。
- 避免泛化文案，如 Continue、Submit、OK。
- 参数错误必须说明字段、允许范围和当前值。
- 危险操作若不可逆，必须说明影响并要求确认；重置当前未保存输入也要可恢复或确认。
- 空状态提供下一步；不得只显示 “No data”。

## 7. 禁止项

- 色相命名业务令牌：`green`、`amber`、`blue`。
- 为页面标题添加渐变文字、超大营销字体或装饰性 glow。
- 在每个 section 里套卡片；同层卡片使用不同圆角或阴影。
- 图标替代文字且没有 accessible name。
- 桌面布局缩小后直接横向溢出。
- 依赖远程字体、运行时 CDN 或第三方样式资源。

## 8. 变更检查清单

1. 使用现有语义令牌，没有新增色相别名或任意颜色值。
2. Light / dark 都检查文本、边框、图表和原生表单控件。
3. 320、390、768、1440px 无页面级横向溢出。
4. 鼠标、键盘和触控都能完成主任务；焦点始终可见。
5. Loading、empty、error、stale、success 状态都有明确文案。
6. reduced motion 下没有必要之外的移动。
7. 运行相关测试、全量测试、ESLint、生产构建和真实浏览器 smoke。
8. 视觉变化后重新生成 `docs/images/` 截图。

## 9. 审查基线

- [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)：交互、表单、焦点、动效、性能与文案。
- [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)：对比度、键盘、焦点与目标尺寸。
- 项目证据与历史缺陷见 [`docs/ui-audit.md`](ui-audit.md)。
