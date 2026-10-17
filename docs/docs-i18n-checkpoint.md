# DocsPage Markdown 与中英文国际化检查点

## 起点与范围

- 基于独立稳定提交 `f3b0b62`；开始时工作区干净，基线 491 项测试通过。
- 本阶段完成文档渲染、双语内容、章节导航、当前语言下载、安全边界及回归验证。
- 没有修改计算模型、计算内核、公式算法、批量计算组件 / Worker / 解析逻辑或应用状态架构。`src/math/`、`src/state/`、`BatchCalculator.jsx`、`batchCompute.js` 等均无改动。

## 审计结论与实现

原 `DocsPage.jsx` 内维护另一套 JSX 文案、参数和公式，六份 Markdown 仅提供下载，并未用于页面渲染。本阶段改为以 Markdown 为展示和下载的同一内容来源，消除这条双重维护路径。

原始文档实际使用了标题、表格、引用式链接、列表、行内数学、单行 / 多行 `$$`、`math` 代码块；MC2010 还使用独占一行的单 `$` 公式边界。上述形式全部建立了回归测试，保留对历史单 `$` 块的兼容。

### 新增 / 升级依赖

| 依赖 | 锁定版本 | 理由 |
| --- | --- | --- |
| `marked` | 18.1.1 | 成熟、持续维护的 CommonMark / GFM 解析器，负责语法、嵌套和引用解析；不自行实现 Markdown 解析器 |
| `marked-katex-extension` | 5.1.13 | 由现有维护中的扩展识别数学 token，包括中文紧邻公式和历史单 `$` 块；不使用其 HTML renderer |
| `entities` | 8.1.0 | 正确解码文本与 URL 实体，防止协议校验被实体混淆；与已有测试依赖去重复用 |
| `katex`（升级既有依赖） | 0.18.10 | 复用既有数学渲染器，并修复旧版 GHSA-238p-pmpm-9mq7 的 trust 绕过风险 |

仅前三项为新增直接依赖，没有引入第二套数学排版库、HTML 注入型 Markdown renderer、运行时翻译服务或新的状态管理库。本地验证使用 Node 22.22.3；CI 已使用 Node 22。KaTeX 新版的 CLI 传递依赖 `commander` 要求 Node >=22.12，应保留这一环境注意事项。

## 中文保留与英文对应

- 原六份中文位于 `public/模型说明/{id}.md`，旧下载 URL 保留。
- 新增完整英文版本 `public/模型说明/en/{id}.md`，覆盖 `aci209`、`mc2010`、`b4`、`b4s`、`gl2000`、`aashto`。
- 五份中文文件保持原始字节；MC2010 只将表格单元格中的 `` `|sigma| ≤ 0.6 fcm` `` 修为 `` `\|sigma\| ≤ 0.6 fcm` ``，避免 GFM 将绝对值符号误当分列符，恢复完整应力要求。还原该转义后，六份文件的 SHA-256 必须与起始检查点一致。
- 英文是逐节技术翻译，不是摘要。测试对照章节层级、所有数学表达式、代码中的参数标识、63 个必填输入及单位、表格数值、列表 / 段落结构和全部引用 URL。
- 数学符号和数值保持一致；仅 ACI 公式内的湿养护 / 蒸汽养护文字条件翻译成英文，测试显式对照这些文字，不放宽其他公式比较。
- `src/docs/documents.js` 提供稳定模型 ID 与共享章节 ID，不从翻译后的标题生成 URL。读取位置按章节 ID 与章节内偏移记录，语言加载完成后即时恢复；既有章节 hash 保持不变。
- 页面和下载均从当前语言的同一公开 Markdown 文件取得内容；下载文件名为 `{id}.{locale}.md`。

## 安全措施

- 只调用隔离的 Marked lexer，得到 token 后映射到受限 React 元素；不调用 Marked 的 HTML 输出方法。
- 原始 HTML token 一律丢弃；不展开源属性，不允许脚本、iframe、SVG、事件属性或任意样式注入。未知 token 只退化为转义文本。
- URL 在实体解码后校验：仅允许 HTTP、HTTPS、mailto 与同源相对路径 / 章节链接；拒绝控制字符、空格、反斜杠、协议相对 URL、javascript、data、file、blob 等协议。
- 外链固定使用 `noopener noreferrer`；图片只显示替代文本，不发起远程图片请求。
- 唯一 `dangerouslySetInnerHTML` 边界为 KaTeX 自身生成的输出，不接收 Markdown HTML；显式拒绝全部 trust 命令，使用无原型宏字典，并限制宏展开、尺寸和公式长度。
- Markdown 限制 200,000 字符，公式限制 10,000 字符；公式失败显示安全源文本及本地化提示，不使页面崩溃。
- 资源读取只接受登记的模型 / 语言路径；成功解析后才缓存。HTTP 错误、SPA HTML 回退、取消请求和异常文件不进入缓存；旧请求成功或失败均不能覆盖新模型 / 新语言或回滚阅读位置。

## 修改文件

- 页面与小屏交互：`src/components/DocsPage.jsx`、`src/components/ui/Header.jsx`。浏览器发现原有顶栏在手机上重叠，因而只调整响应式空间和短视觉标签，保留完整辅助名称与原导航行为。
- 渲染与加载：`src/docs/markdown.js`、`MarkdownDocument.jsx`、`MathExpression.jsx`、`documents.js`、`loadDocument.js`。
- 文档内容：`public/模型说明/en/` 下六份英文文档，以及中文 `mc2010.md` 的单处表格转义修复。
- 文案：`src/i18n/messages/{en,zh}/docs.js`、文案入口和 `shell.js` 中的窄屏短标签。
- 新测试：`src/components/DocsPage.test.jsx`、`src/docs/{MarkdownDocument,documents,loadDocument}.test.*`、`src/docs/__fixtures__/syntax.md`。
- 扩展既有测试：`languageMarkup.test.jsx`、`shippedAssets.test.jsx`、`shellLayout.test.jsx`、`src/i18n/locale.test.jsx`。
- 测试资源边界：`src/testUtils/documentFetch.js`、`src/setupTests.js`。默认测试读取真实公开文档，仅替换文档 HTTP 边界，不伪造空内容或绕过 renderer。
- 依赖：`package.json`、`package-lock.json`。
- 本报告：`docs/docs-i18n-checkpoint.md`。

## 验证结果

- 完整测试：44 个文件、585 项测试全部通过；比基线增加 94 项。
- ESLint：通过，无新增忽略规则。
- Build：通过；文档解析器位于懒加载的 DocsPage chunk，约 83.05 kB / gzip 34.94 kB，未放入计算核心。
- 本阶段涉及的 18 个代码 / 文案检查目标：Biome LSP 零诊断。
- `git diff --check`：通过；未删除或跳过既有用例。原混排 / 单中文下载断言更新为当前语言语义，并增加双语覆盖。
- 生产构建 Chromium：12 份文档全部渲染，合计 260 个数学表达式无错误；目录目标全部有效，下载 HTTP 200，下载源 SHA-256 与仓库文件一致。
- 实际浏览器点击下载 B4 中英文文件，下载字节分别与对应源文件完全相同。
- 390 / 768 / 1800px 文档视口：B4 的 79 个公式均正常，语言切换后 `#basic-creep` 仍位于 112px 阅读线，无页面横向溢出。
- 320 / 390 / 600 / 768 / 900 / 1800px × 中英文 × 三个工作区，共 36 项顶栏几何检查：按钮无重叠、越界，应用 body 内容无横向溢出；无 HTTP 失败或 JavaScript 异常。

## 剩余技术债务与注意事项

1. **既有依赖安全债务**：与 `f3b0b62` 的冻结 lockfile 审计相比，受影响依赖条目从 17 降至 16，没有新增受影响依赖。仍有 12 high、4 moderate；仅生产依赖审计中为 1 个 high 条目：`read-excel-file -> @xmldom/xmldom@0.9.10`，涉及 XML 注入 / 资源消耗等多项公告。本阶段未擅自升级批量 XLSX 解析链，建议下一阶段单独修复并覆盖 XLSX 安全及兼容性回归。
2. 英文已作全文技术对照及自动化不变量检查，但自动化不能替代专业工程人员的规范措辞审阅；文档本身的试验 / 工程判断免责声明保留。
3. 新增或重排章节时，需要同步更新共享章节 ID 清单和中英文层级；测试会检查数量、层级及两种语言的对应关系。
4. 图片渲染和其他扩展 Markdown 语法未启用；未来若需要远程图片或自定义 HTML，必须先设计资源及信任策略，不能绕过当前边界。
5. Browserslist 过期提示、jsdom 下载导航提示仍为既有非失败提示。320px 批量页在 Chromium 移动模拟下还观察到根节点滚动宽度统计多 11px，但 body 和所有可见控件矩形正常；该额外统计被保留记录，没有借机修改批量页面。
