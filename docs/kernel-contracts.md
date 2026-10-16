# Kernel parameter contracts (JS ↔ Rust)

Single source of semantics: `src/wasm/creepEngine.js` builders.
Batch rows go through `src/math/creepModels.js` `*Single` adapters, not through WASM batch.

## Wire shapes

| Kernel | JS builder in | Wire out (serde) | Rust struct | Notes |
|---|---|---|---|---|
| ACI 209 | `{curingType,t0,H,VS,slump,fineAggregate,airContent}` | same keys | `Aci209Params` with `rename H/VS/curingType/fineAggregate/airContent`, `curing_type: Moist/Steam` lowercase | single/series/batch consistent |
| MC2010 series | `{fcm,RH,t0,Ac,u,T,Cs,sigma}` | `{fcm,rh,t0,ac,u,t,cement_type,sigma}` | `Mc2010Params` snake_case, no renames | `t` = curing temp °C, not age |
| MC2010 batch | raw batch row `{fcm,RH,t0,Ac,u,T,Cs,sigma,t}` | caps `RH/Ac/T/Cs` + `t` = age | batch `BatchItem` renames to caps | builder output must NOT be reused for batch |
| B4/B4s | UI camelCase (`tPrime/Tcur/vS/wC/...`) | snake_case (`t_prime/t_cur/v_s/w_c/...`) | plain snake_case structs, no renames | B4 21 fields, B4s 12 fields |
| GL2000 | `{fcm28,h,vs,tc,t0,cementType}` | `{fcm28,h,vs,tc,t0,cement_type}` | snake_case | `t0 >= tc` required |
| AASHTO | `{fci,H,vs,ti,tc}` | `{fci,h,vs,ti,tc}` | snake_case | `fci` SI in, KSI inside; `vs` capped |

## Warnings

- `t` is overloaded in MC2010: series `t` is curing temperature, batch `t` is evaluation age.
- `.d.ts` params are `any`; `assertContract` is the only shape check.
- `src/wasm-pkg/` is committed build output: regenerate in the same commit as Rust changes.
  Toolchain is pinned by `rust-toolchain.toml`; build with `npm run build:wasm`.
