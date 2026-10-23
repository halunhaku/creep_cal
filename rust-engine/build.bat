@echo off
REM Rust WebAssembly 构建脚本 (Windows)

echo 🦀 开始构建 Rust WebAssembly 模块...

REM 检查 wasm-pack 是否安装
where wasm-pack >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ wasm-pack 未安装，请手动安装
    echo 请访问: https://rustwasm.github.io/wasm-pack/installer/
    pause
    exit /b 1
)

REM 检查 Rust 工具链
where rustc >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Rust 未安装，请先安装 Rust
    echo 请访问: https://rustup.rs/
    pause
    exit /b 1
)

REM 添加 wasm32 目标
rustup target add wasm32-unknown-unknown

echo 📦 构建 WebAssembly 包...

REM Rust embeds the paths it compiled from in the module's data section; remap
REM them so a rebuild anywhere produces the same bytes (see build.sh).
if "%CARGO_HOME%"=="" set "CARGO_HOME=%USERPROFILE%\.cargo"
set "RUSTFLAGS=--remap-path-prefix=%CD%=/build/rust-engine --remap-path-prefix=%CARGO_HOME%=/cargo %RUSTFLAGS%"

REM 构建 WebAssembly 包
wasm-pack build --target web --out-dir ../src/wasm-pkg --scope creep-calculator

if %ERRORLEVEL% EQU 0 (
    REM wasm-bindgen stamps its own build identity into the `producers` section;
    REM dropping it keeps the committed bytes generator-independent.
    node ..\scripts\stripWasmProducers.mjs ..\src\wasm-pkg\creep_calculator_engine_bg.wasm
    echo ✅ WebAssembly 构建成功！
    echo 📁 输出目录: ../src/wasm-pkg
    
    REM 显示生成的文件
    echo 📄 生成的文件:
    dir ..\src\wasm-pkg\
    
    echo.
    echo 🚀 现在可以在 React 应用中导入 Rust 模块：
    echo    import init, { calculate_aci209_single } from './wasm-pkg/creep_calculator_engine.js';
    
) else (
    echo ❌ 构建失败，请检查错误信息
    pause
    exit /b 1
)

pause
