# ギャップ分析: takt-marp-global-installer

生成日時: 2026-06-09T15:09:00Z

## 分析サマリー

- 既存の `scripts/lib/takt-marp-slide-workflow.mjs` と runner は target validation、prerequisite、approval、report freshness、rerun/force の中核契約を持っており、global CLI から再利用できる余地が大きい。
- 最大の gap は package 境界である。現状は `bin`、`files`、`engines`、runtime `dependencies` がなく、`npm pack --dry-run` では `.agents`、`.claude`、`.kiro`、`.takt/config.yaml` など多数の非 installer 資産が package に含まれる。
- 2つ目の大きな gap は executable 解決である。現行 runner は `process.cwd()/node_modules/.bin/takt`、build script は `process.cwd()/node_modules/.bin/marp` を直接参照しており、target project に `node_modules` を要求しない要件と衝突する。
- smoke validation は mock provider 既定と provider 別 summary を既に持つが、repo-local `npm run slide:*` と repo root 前提が強く、global install 経路の validation には新しい薄い installer validation が必要である。
- 推奨される design phase の焦点は、global CLI adapter、project initializer、runtime executable resolver、package template/manifest validation を小さな責務に分け、巨大な smoke script へさらに分岐を足さないことである。

## ドキュメント状態

- 要件は生成済みだが未承認である。このスペックは既存パッケージングと CLI 統合を扱うため、設計承認前の要件修正に調査結果を反映できるようギャップ分析を先行する。
- Core steering files `product.md`、`tech.md`、`structure.md` は存在しない。分析は `.kiro/steering/roadmap.md`、requirements、`package.json`、既存 scripts、`.takt/` assets、CI workflow、`npm pack --dry-run --json` の結果に基づく。
- 外部 web research は実施していない。現時点の主要 gap は local package metadata、script path resolution、CI wiring で判断できる。

## 現状調査

### パッケージメタデータ

現在の `package.json`:

- `name: "takt-marp"` と `version: "0.0.1"` はある。
- `bin` は未定義で、`npm install -g` 後に `takt-marp` command は生えない。
- `files` は未定義で、publish/install 対象が明示されていない。
- `engines.node` は未定義で、`mise.toml` の Node 24 要求が npm install 利用者へ伝わらない。
- `@kazumatu981/markdown-it-kroki`、`@marp-team/marp-cli`、`takt` は `devDependencies` にあり、global CLI runtime dependency としては不十分である。
- `overrides.yargs` は存在するため、dependencies 移行時も lockfile と npm install 挙動の確認が必要である。

`npm pack --dry-run --json` の観測:

- `.agents/**`、`.claude/**`、`.kiro/**`、`.takt/config.yaml`、`.takt/workflows/**`、`.takt/facets/**`、scripts、fixtures などが package に含まれている。
- `.takt/config.yaml` が package に含まれることは、requirements の「provider 設定を生成・配布対象にしない」意図と衝突しやすい。
- `.takt/runs/**`、`.takt/render/**` など runtime state は `.gitignore` により pack 対象外になっているように見えるが、これは package `files` ではなく gitignore fallback に依存している。

### 既存 CLI とランナーの表面

現在の `package.json` scripts:

- `slide:plan`
- `slide:compose`
- `slide:polish`
- `slide:deliver`
- `slide:check-state`
- `slide:approve`
- `slide:render-evidence`
- `slide:validate-foundation`
- `slide:smoke`

再利用可能な資産:

- `scripts/lib/takt-marp-slide-workflow.mjs`
  - `COMMANDS`
  - `resolveDeckTarget`
  - `assertCommandPrerequisites`
  - `assertWorkflowAvailable`
  - supervision/approval validation
  - rerun/force helper
- `scripts/takt-marp-run-slide-workflow.mjs`
  - existing `plan / compose / polish / deliver` orchestration
  - `--provider`
  - report sync from `.takt/runs/**` to `slides/<deck>/review/`
- `scripts/takt-marp-validate-slide-workflow-smoke.mjs`
  - `DEFAULT_SMOKE_PROVIDER = "mock"`
  - provider-specific summary filename
  - synthetic mock artifacts and reports

阻害要因:

- `taktExecutablePath()` returns `process.cwd()/node_modules/.bin/takt`.
- `assertTaktExecutableAvailable()` errors with `Run npm install and verify the takt devDependency.`
- `scripts/takt-marp-build-slide-artifact.mjs` resolves Marp CLI from `process.cwd()/node_modules/.bin/marp`.
- smoke validation uses `ROOT = path.resolve(SCRIPT_DIR, "..")` and runs repo-local scripts or `npm run slide:*` from that root.

### `.takt/` 資産

現在の `.takt/` には以下が含まれる:

- tracked/configured assets（追跡・設定対象の資産）:
  - `.takt/config.yaml`
  - `.takt/workflows/takt-marp-slide-plan.yaml`
  - `.takt/workflows/takt-marp-slide-compose.yaml`
  - `.takt/workflows/takt-marp-slide-polish.yaml`
  - `.takt/workflows/takt-marp-slide-deliver.yaml`
  - `.takt/workflows/takt-marp-slide-ai-quality-gate.yaml`
  - `.takt/facets/**`
- runtime state present locally but ignored（ローカルには存在するが ignore される実行時状態）:
  - `.takt/persona_sessions.json`
  - `.takt/session-state.json`
  - `.takt/workflow-current-target.json`
  - `.takt/runs/**`
  - `.takt/render/**`

`.takt/.gitignore` explicitly unignores `config.yaml`, workflows, and facets. That is correct for this repository but is not the desired installer copy boundary. The global installer needs a package template boundary independent from `.takt/.gitignore`.

### CI

現在の `.github/workflows/ci.yml`:

- Node version is `22`.
- Runs `npm ci`, `npm test`, and `npm run slide:smoke`.
- Does not run `npm pack`.
- Does not install the package into a temporary global prefix.
- Does not verify `takt-marp init .` behavior.
- Does not verify template drift or package file allowlist.

This conflicts with requirements that call for Node `>=24` and global install validation.

### ファイルサイズのシグナル

- `scripts/takt-marp-validate-slide-workflow-smoke.mjs`: 1932 lines.
- `scripts/takt-marp-run-slide-workflow.mjs`: 369 lines.
- `scripts/lib/takt-marp-slide-workflow.mjs`: 453 lines.

The smoke script is already far beyond the 1k-line quality threshold. The installer work should not add global install, template sync, and package validation branches into that file unless there is a compelling reason.

## 要件と資産の対応

| 要件 | 既存資産 | ギャップ状態 | メモ |
| --- | --- | --- | --- |
| 1. global command | `package.json` name exists | Missing | no `bin`, no CLI adapter, no `engines.node`, runtime deps in `devDependencies` |
| 2. explicit init | `.takt/workflows/**`, `.takt/facets/**` exist | Missing | no `takt-marp init`, no `templates/project/**`, no copy logic |
| 3. init conflicts | none specific | Missing | no conflict detection, no atomic default failure, no `--force` / `--overwrite` behavior |
| 4. no target npm project | `resolveDeckTarget` supports cwd root; runner can be invoked with cwd | Constraint | `takt` and `marp` executable resolution currently uses target `node_modules` |
| 5. existing workflow contract | runner/lib already enforce target, prereq, approval, freshness, rerun/force | Partial | reusable, but needs global execution context and direct package runner invocation |
| 6. mock/real smoke | smoke script defaults to mock and writes provider-specific summary | Partial | repo-local root and `npm run` assumptions remain; no `takt-marp smoke` wrapper |
| 7. template scope/drift | `.takt/workflows/**`, `.takt/facets/**` are available | Missing | no canonical package template, no manifest/allowlist, no drift validator |
| 8. CI global install | existing CI runs foundation and mock smoke | Missing | no `npm pack`, no temp prefix install, Node version mismatch |

## ギャップと制約

### 不足している能力

1. `takt-marp` bin entrypoint.
2. User-facing CLI command dispatcher.
3. `init` command with safe copy and conflict handling.
4. Dedicated package template directory for `workflows/**` and `facets/**`.
5. Template manifest or allowlist.
6. Template drift validation between package template and `.takt/workflows/**` / `.takt/facets/**`.
7. Package file boundary validation.
8. Runtime dependency migration from `devDependencies` to `dependencies`.
9. `engines.node >=24`.
10. Runtime executable resolution that distinguishes target project root from package runtime root.
11. Global smoke wrapper around existing smoke validation.
12. CI job or step for `npm pack` and temporary global install validation.

### 制約

- Existing repo-local scripts are still valid and should remain as compatibility/development entrypoints.
- Existing workflow semantics must not be redefined.
- Target project root is intentionally `process.cwd()` with no parent discovery.
- Provider config remains user-owned and must not be generated by `init`.
- `slide:*` names must not become global CLI aliases.
- Current CI uses Node 22, while requirements and `mise.toml` indicate Node 24.
- Current `npm pack` includes many files that are unrelated to a global installer.

### 設計フェーズで必要な追加調査

- Confirm the most reliable way to resolve dependency binaries from an installed npm package in this repo's ESM scripts without relying on target project `node_modules`.
- Confirm whether TAKT supports being invoked from a package-owned binary while reading workflows/facets from the target cwd exactly as required, especially for `-w takt-marp-slide-<command>` name resolution.
- Decide whether `takt-marp smoke` should validate an external target project or use a package-owned smoke fixture copied into a temporary project. Current smoke is repo-root oriented.
- Decide exact package include policy: `files` allowlist only, `.npmignore`, or both. The requirements point toward `files` allowlist plus template manifest validation.

## 実装アプローチの選択肢

### 選択肢A: 既存ランナーと smoke script を拡張する

**形**

- Add `bin` entrypoint that dispatches to existing scripts.
- Extend `scripts/lib/takt-marp-slide-workflow.mjs` with optional package runtime root.
- Extend `scripts/takt-marp-run-slide-workflow.mjs` to accept package-owned executable paths.
- Extend current smoke script for global install validation.

**利点**

- Minimal new files.
- Reuses known validation and report sync behavior.
- Lower initial wiring effort.

**欠点**

- High risk of adding mode flags and path special cases to existing runner and smoke paths.
- The smoke script is already 1932 lines; adding installer concerns there would worsen maintainability.
- Global and repo-local execution may become tangled if package root and project root are optional everywhere.

**適合性**

- Viable only if changes are tightly constrained to a small runtime context helper and no new installer validation logic is added to the large smoke file.

### 選択肢B: 専用の installer コンポーネントを作る

**形**

- Add a dedicated bin CLI module.
- Add a dedicated initializer module.
- Add a dedicated package template directory and manifest.
- Add focused validation scripts for package template, drift, and global install.
- Keep existing runner mostly intact, but expose a narrow way to pass runtime executable resolution.

**利点**

- Clean separation between slide workflow behavior and installer/package concerns.
- Avoids growing the 1932-line smoke script.
- Easier to test `init` conflict handling and package allowlist in isolation.
- Makes template ownership explicit.

**欠点**

- More files and interface design.
- Requires careful integration so existing runner contract is not duplicated.
- Needs design discipline around project root vs package root.

**適合性**

- Strong fit for the requirements because installer behavior has distinct lifecycle, validation, and packaging boundaries.

### 選択肢C: ハイブリッドアプローチ

**形**

- Create dedicated CLI/init/template/installer-validation modules.
- Add a small shared runtime context helper used by both global CLI and existing runner.
- Keep existing `npm run slide:*` scripts as repo-local entrypoints.
- Add a thin global wrapper for smoke that delegates to existing smoke behavior where safe, while keeping global install validation separate.

**利点**

- Preserves existing workflow contract and tests.
- Avoids duplicating target/state/approval/rerun logic.
- Keeps installer-specific complexity out of the large smoke script.
- Allows incremental validation: package boundary first, runtime executable resolution second, global install smoke last.

**欠点**

- Requires a clear design for runtime context and binary resolution.
- Some existing tests that assume fake `root/node_modules/.bin/takt` will need targeted updates or parallel tests for repo-local/global paths.

**適合性**

- 最もバランスがよい選択肢である。既存の正規 workflow helper を使いつつ、installer に固有の関心事には新しい所有境界を作れる。

## 複雑さとリスク

- **工数:** L（1-2週間）
  - 理由: package metadata、CLI surface、initializer semantics、executable resolution、package templates、drift validation、global install tests、CI にまたがるため。
- **リスク:** Medium-High
  - 理由: runtime root の分離はアーキテクチャ上の変更であり、target project 前提が global install の挙動へ漏れやすい。package allowlist も `npm pack` に含まれる内容を変えるため、慎重な検証が必要である。

## 設計フェーズへの推奨

1. ハイブリッドアプローチを優先する。
2. 単一の runtime context model を早期に定義する:
   - project root: slides、`.takt/runs`、`.takt/render`、deck reports が存在する場所
   - package root: scripts、templates、fixtures、npm dependencies が存在する場所
   - runtime binaries: TAKT と Marp を package-owned dependencies から解決する
3. `init` 実装は workflow runner 実装から分離する。
4. package template validation は smoke validation から分離する。
5. `scripts/takt-marp-validate-slide-workflow-smoke.mjs` に installer 分岐を追加せず、専用の installer validation script を作る。
6. global installer validation の前、または同時に CI を Node 24 へ更新する。
7. package boundary の回帰を検出できるよう、validation で `npm pack --dry-run --json` または実 tarball inspection を使う。

## 設計に向けた未解決事項

- `takt-marp smoke` は現在の target project、生成した temporary project、または cwd にコピーした package smoke fixture のどれに対して実行すべきか。
- package template drift は byte-for-byte comparison、manifest hash comparison、または normalized path/content comparison のどれで検出すべきか。
- repo-local scripts は引き続き local `node_modules` を要求すべきか、それとも shared package/runtime executable resolver へ移行すべきか。
- `takt-marp init . --force` と `--overwrite` は完全な alias にするか、片方を help output 上の canonical option にするか。
