#!/bin/bash
# 始终以 rust-engine/ 为工作目录，支持从仓库根目录经 npm run build:wasm 调用。
cd "$(dirname "$0")"

# Rust WebAssembly 构建脚本

echo "🦀 开始构建 Rust WebAssembly 模块..."

# 检查 wasm-pack 是否安装
# 不再自动执行 `curl ... | sh`：请自行安装（cargo install wasm-pack 或
# https://rustwasm.github.io/wasm-pack/installer/）。
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack 未安装，请先安装：cargo install wasm-pack"
    exit 1
fi

# 检查 Rust 工具链
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust 未安装，请先安装 Rust"
    exit 1
fi

# 添加 wasm32 目标
rustup target add wasm32-unknown-unknown

echo "📦 构建 WebAssembly 包..."

# Rust embeds the paths it compiled from in the module's data section, and both
# this project's directory and the cargo registry's live at a user- or
# runner-specific absolute path. Without remapping them, a checkout in
# /Users/x/... and a CI checkout in /home/runner/work/... produce modules that
# differ in a handful of bytes and the drift check in CI can never pass. See
# README "Rust WebAssembly".
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export RUSTFLAGS="--remap-path-prefix=$(pwd)=/build/rust-engine --remap-path-prefix=$CARGO_HOME=/cargo ${RUSTFLAGS:-}"

# 构建 WebAssembly 包
wasm-pack build --target web --out-dir ../src/wasm-pkg --scope creep-calculator

if [ $? -eq 0 ]; then
    # wasm-pack rewrites the out-dir `.gitignore` to a bare `*`; this package
    # is committed on purpose, so restore the curated file.
    git -C .. checkout -- src/wasm-pkg/.gitignore 2>/dev/null || true
    # wasm-bindgen stamps its own build identity into the `producers` section,
    # and a released binary stamps a different string than a `cargo install`ed
    # one. Dropping the section keeps the committed bytes the same whichever
    # wasm-bindgen built them (see scripts/stripWasmProducers.mjs).
    node ../scripts/stripWasmProducers.mjs ../src/wasm-pkg/*.wasm
    echo "✅ WebAssembly 构建成功！"
    echo "📁 输出目录: ../src/wasm-pkg"
    
    # 显示生成的文件
    echo "📄 生成的文件:"
    ls -la ../src/wasm-pkg/
    
    echo ""
    echo "🚀 现在可以在 React 应用中导入 Rust 模块："
    echo "   import init, { calculate_aci209_single } from './wasm-pkg/creep_calculator_engine.js';"
    
else
    echo "❌ 构建失败，请检查错误信息"
    exit 1
fi
