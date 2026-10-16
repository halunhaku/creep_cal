# CREEP_LAB 项目介绍

CREEP_LAB 是一个面向混凝土徐变与收缩分析的本地计算平台。项目集成 ACI 209R-92、fib Model Code 2010、RILEM B4、RILEM B4s、GL2000、AASHTO LRFD 六类预测模型，提供单点参数分析、批量数据计算和模型公式文档浏览能力。

平台采用 React + Vite 构建前端界面，使用 Tailwind CSS 和项目内的 [IBM/Carbon 设计规范](docs/design-system.md) 统一视觉风格（IBM Plex Sans、IBM Blue、方角无阴影面板）。计算层同时提供 JavaScript 参考实现与 Rust WebAssembly 高性能实现，用户可以在单点计算场景中切换引擎，便于对比结果、验证模型和观察性能差异。批量管线六个模型统一用 JavaScript 参考内核计算（Rust 仅暴露 ACI 209 和 MC 2010 的 batch 入口，混用会导致行间不可比）。

## 核心功能

- 单点计算：选择模型和计算引擎，调整模型参数，显式计算后生成 10,000 天时程曲线，并在目标龄期查看分解值。
- 批量计算：导入 CSV 或 XLSX 数据表，每行作为一组工况自动计算，并输出结果矩阵。
- 结果可视化：分离的合规曲线与收缩曲线，支持线性/对数时间轴切换、分解值查看和图表数据导出。
- 模型文档：内置模型说明、输入参数、输出量、参考文献和核心公式，并可下载各模型的 Markdown 说明文件。
- WASM 内核：Rust 计算模块已预编译到 `src/wasm-pkg/`，前端通过动态加载方式调用。

## 技术结构

| 层级 | 内容 |
| --- | --- |
| 前端框架 | React 19、Vite |
| 样式系统 | Tailwind CSS、CSS 变量、IBM/Carbon Design System |
| 图表 | Recharts |
| 文档公式 | KaTeX 渲染 + 模型说明 Markdown 下载 |
| 数据导入 | PapaParse、read-excel-file |
| 计算内核 | JavaScript 参考内核（`src/math/creepModels.js`）、Rust WebAssembly（`src/wasm-pkg/`，源码在 `rust-engine/`） |
| 部署配置 | Cloudflare Pages / Wrangler |

## 主要界面

### 宽屏布局套图

在桌面宽屏下，各主界面会展开为更适合横向浏览的布局。单点计算页将参数面板、核心指标和系统日志分栏展示；批量矩阵页能同时呈现配置、表格和图表；模型文档页则把参数、输出、参考文献和公式内容组织在更宽的阅读空间里。

![宽屏单点计算界面](docs/images/ui-wide-single-analysis.png)

![宽屏批量矩阵界面](docs/images/ui-wide-batch-matrix.png)

![宽屏模型文档界面](docs/images/ui-wide-model-docs.png)

### 单点计算

单点计算界面用于选择算法、切换 Rust 或 JS 引擎，并通过参数面板调整模型输入。

![单点计算界面](docs/images/ui-single-analysis.png)

### 批量矩阵

批量计算界面支持上传 CSV/XLSX、下载模板、加载示例数据，并展示计算后的结果表格与可视化图表。

![批量矩阵界面](docs/images/ui-batch-matrix.png)

### 模型文档

模型文档界面集中展示各模型的参数、输出、参考文献和核心公式，方便在计算过程中查阅依据。

![模型文档界面](docs/images/ui-model-docs.png)

## 适用场景

CREEP_LAB 适合用于混凝土长期性能分析、教学演示、模型对比、参数敏感性观察，以及需要从表格批量生成徐变或收缩预测结果的轻量工程计算场景。

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```
