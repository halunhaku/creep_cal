# BatchCalculator 中英文改造检查点

## 范围

本阶段只推进批量计算的国际化、数据保护及回归验证；未修改 `src/components/DocsPage.jsx`，未修改 `package.json` / `package-lock.json`，没有新增 Markdown 依赖。计算内核 `src/math/creepModels.js`、结果生成 `src/components/batchCompute.js` 及其 CSV 数值约定保持不变。

开始时工作区已有上一阶段未提交的外壳、单模型及 i18n 基础设施改动；本检查点一并保存这些前置工作，没有回滚或拆散它们。开始时基线为 38 个测试文件、411 项测试通过，ESLint 通过。

## 本阶段修改文件

- `src/components/BatchCalculator.jsx`：`useT()` / `pick()` 显示文案，按当前语言格式化数字，错误描述符，数据替换确认，异步源数据保留与过期任务保护。
- `src/components/batchModels.js`：六个模型的中英文输出标签；输入字段名、结果字段名、模板值保持不变。
- `src/components/batchValidation.js`：仅显示时选择内核诊断的语言，保留原始诊断及原始用户输入。
- `src/state/appStore.js`：增加数据集异步任务代次；沿用现有 store，不引入新的状态架构。
- `src/state/urlSync.js`：网址 / 前进后退切换批量模型的清空确认、取消后恢复真实网址、确认后使旧任务失效。
- `src/i18n/messages/en/batch.js`、`src/i18n/messages/zh/batch.js`：批量计算界面及确认、错误文案。
- `src/i18n/messages/en.js`、`src/i18n/messages/zh.js`：接入批量文案模块。
- `src/components/BatchCalculator.locale.test.jsx`、`src/components/batchValidation.test.js`：新增回归覆盖。
- `src/components/BatchCalculator.test.jsx`、`src/components/batchLimits.test.jsx`、`src/components/languageMarkup.test.jsx`、`src/i18n/locale.test.jsx`：保留原行为验证，适配明确确认、数字分组及单语言显示，并扩展双语言检查。
- `docs/batch-i18n-checkpoint.md`：本报告。

前置工作涉及 `index.html`、`src/App.jsx`、六个单模型计算器、`ModelCalculator`、单模型仪表板、错误 / 加载组件、`src/components/ui/` 下的外壳与参数组件、`src/i18n/` 基础设施及相关测试；完整文件清单以本检查点的 `git show --stat` 为准。

## 解决的问题

1. 批量界面不再固定英文或中英混排；按钮、状态、列映射、辅助标签、图表提示、限制与错误随语言切换。
2. 表格、统计、进度、提示框、坐标轴及 Brush 使用当前语言的格式器。输入框仍使用原始可解析字符串；原始记录、计算值、固定 4 / 6 / 9 位结果精度及 CSV 字节内容不受语言影响。
3. 原生模型选择保留源数据并按新模型重算；缺列时进入映射，不丢弃数据。大于 1,000 行的 Worker / 分块计算期间也保留源数据。仅剔除前一模型的实际结果字段，不再误删用户自定义的 `result_notes` 等列。
4. 上传、拖放或加载示例替换现有数据前明确确认。取消不改变数据、映射或运行中的任务，仍可再次选择同一文件。
5. 网址模型切换沿用原有清空语义，但必须先确认。取消会恢复反映当前模型的网址；确认会使旧解析、Worker、分块任务及其错误 / 进度失效，即使随后返回同一模型，也不能恢复已清空的数据。
6. 语言切换不重建数据集、不重新计算，不销毁输入草稿、映射选择、图表类型、对数状态或当前进度。已有错误也按新的语言重新显示。

## 验证结果

- `npm test`：40 个测试文件、491 项测试全部通过；相较基线新增 80 项，没有跳过、删除或放宽原有功能覆盖。
- `npm run lint`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- 新增模块、文案及测试的 Biome LSP 检查无诊断。
- 实际 Chromium 冒烟：中文 B4 演示数据 9 行有效；切换英文后保留同一个结果矩阵 DOM 和 9 行数据；B4 切换 B4s 后仍为 9 行有效、文件名保留。

重点自动化覆盖：实际语言切换按钮、未提交输入草稿、列映射选择、已有错误、六模型结果精度、当前语言格式器、Tooltip / 坐标轴 / Brush、语言间 CSV 字节一致性、非法数值解析不变、替换确认 / 取消、异步解析与 Worker 进度、分块模型重算、旧任务成功及失败回调、网址切换确认 / 取消和返回同一模型后的过期任务隔离。

## 仍存在的风险 / 既有限制

- 批量数据仍只保存在内存中；完整刷新或关闭页面不会恢复上传数据。本阶段没有扩展数据持久化。
- 不认识的第三方解析器错误详情按原样显示，中文界面中可能出现英文技术详情；已知内核诊断有中英文及源代码驱动的完整性测试。
- 网址模型变更经确认后仍会清空数据；希望无损尝试另一模型时应使用批量界面的模型选择器。
- 验证中仍出现既有 Browserslist 数据过期提示及 jsdom 下载导航提示；均不导致测试 / 构建失败，未为消除提示修改依赖或削弱测试。
- 既有 Biome 对结果矩阵滚动区域的语义 / 可聚焦性以及 store 订阅回调写法仍有静态建议；它们不由本次改造引入，ESLint 无问题。本阶段没有借机做无关重构。

`DocsPage.jsx` 的 Markdown、公式与双语文档实现未开始；下一阶段另行规划，不在本检查点中引入渲染器或依赖。
