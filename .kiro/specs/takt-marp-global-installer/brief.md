# ブリーフ: takt-marp-global-installer

## 問題

このリポジトリの利用者は、現状では repo を直接 clone して `npm run slide:*` scripts を知っている前提で Marp slide workflow を実行する必要があります。別プロジェクトや新しい環境で使うとき、導入手順、依存関係、実行コマンドの入口が repo-local な知識に寄りすぎており、再利用しにくい状態です。

## 現状

`package.json` は npm package としての名前と scripts を持っていますが、`bin` entrypoint はありません。そのため `npm install -g` しても `takt-marp` のような command は生えず、グローバルCLIとして `plan / compose / polish / deliver` などを呼び出す導線も定義されていません。

## 目指す状態

利用者が `npm install -g` でこの package を導入すると、`takt-marp` command が利用可能になります。通常の利用では対象プロジェクトへ `.takt/workflows/` と `.takt/facets/` の template をコピーせず、package に同梱された bundled template を使って `takt-marp plan / compose / polish / deliver` と `takt-marp smoke` を実行できます。workflow/facet を対象プロジェクトでカスタマイズしたい場合だけ、利用者は `takt-marp eject .` を実行して template assets を `.takt/` 配下へ持ち出せます。

## アプローチ

npm package の `bin` entrypoint と薄い CLI adapter を追加し、`npm install -g` は global command 配置と実行依存の導入を担当させます。workflow command は既定で package 内に同梱した dedicated template assets を参照し、対象プロジェクトへ template assets をコピーしません。対象プロジェクトへのコピーは `takt-marp eject .` の明示実行時だけ行い、ejected assets は user-owned copy として扱います。package は開発用 `.takt/` を runtime に直接参照せず、`templates/project/workflows/**` と `templates/project/facets/**` のような専用 template directory を配布用 canonical template として持ちます。開発用 `.takt/workflows/**` と `.takt/facets/**` は dev consumer として扱い、package template との drift を検証します。`.takt/` は丸ごとコピーせず、`runs/`、`render/`、session state、current target marker などの runtime state は配布対象から除外します。workflow command の project root は `process.cwd()` に固定し、`eject <dir>` だけ明示 path を受け取ります。CLI adapter は command parsing、help表示、project path 解決、`projectRoot` と `packageRoot/runtimeBin` を分離した runner/dependency resolution を使った既存 runner への委譲だけを担当し、slide workflow の状態管理や report contract は既存実装を source of truth とします。

## スコープ

- **対象範囲**:
  - `package.json` の `bin` entrypoint 定義
  - `npm install -g` 後に利用できる `takt-marp` command
  - workflow command が package 同梱 template を使い、対象プロジェクトへ `.takt/workflows/` と `.takt/facets/` を自動生成しない no-copy 実行モデル
  - `takt-marp eject .` による対象プロジェクトへの `.takt/workflows/` と `.takt/facets/` の template 生成
  - `takt-marp eject <dir>` による明示 project root への assets 持ち出し
  - `.takt/workflows/**`、`.takt/facets/**` に限定した curated template の bundled/eject 利用
  - global package 側に runner と実行依存を置き、対象プロジェクトの `package.json`、`node_modules`、local `takt-marp` install を必須にしない実行モデル
  - global CLI が `npm run` を経由せず、package 内 runner script を直接呼び出す実行モデル
  - runner execution context を `projectRoot` と `packageRoot/runtimeBin` に分離し、TAKT executable を target project の `node_modules` から解決しない実行モデル
  - `engines.node` による Node.js runtime version 境界と、global CLI 実行に必要な npm packages の `dependencies` 管理
  - package に同梱する dedicated installer template assets と npm publish/install 時の `files` 境界
  - template manifest または hardcoded allowlist による `workflows/**`、`facets/**` だけの package/include 境界
  - `templates/project/{workflows,facets}` を配布用 canonical template とし、開発用 `.takt/workflows` / `.takt/facets` との drift を検出する同期・検証 script
  - `takt-marp plan|compose|polish|deliver <target>` から既存 workflow runner へ委譲する入口
  - `takt-marp smoke [--provider mock|real...]` による既存 smoke validation script への必要最小限の入口
  - real provider 実行時にユーザ環境側の TAKT/provider 設定を利用する境界
  - `takt-marp eject .` の既存ファイル衝突検出、衝突一覧表示、明示 `--force` / `--overwrite` 時だけの上書き
  - `takt-marp init` の廃止と `eject` への明示案内
  - global install 後の help / usage / error message
  - workflow command 実行時に project-local `.takt/workflows/` / `.takt/facets/` がなくても bundled template へ fallback する挙動
  - `npm pack` tarball を一時 npm prefix に install して global command surface を検証する決定論的テスト
  - installer validation として no-copy workflow command が対象プロジェクトへ template assets を生成しないこと、`takt-marp eject .` が `workflows/**`、`facets/**` だけを生成すること、既存ファイル衝突時に失敗すること、`takt-marp smoke` が mock provider で通ることの確認
- **対象外**:
  - slide workflow の command/state/report/approval contract の再設計
  - TAKT workflow YAML や facets の責務変更
  - npm registry publish automation
  - 複数 package への分割
  - `npm install -g` 以外の Homebrew / mise plugin / standalone binary 配布
  - global CLI における `slide:*` command alias の追加
  - provider 設定ファイル、API key、ユーザ環境設定の生成・変更

## 境界候補

- CLI adapter: global command の argv parsing と package 内 runner script への直接委譲だけを所有する
- Project ejector: `takt-marp eject .` の template copy、上書き確認、既存 `.takt/` との衝突検出を所有する
- Runtime dependency owner: `takt`、Marp CLI、runner script など command 実行に必要な依存を global package 側に閉じ、target project 側の npm project 化を要求しない。既存 runner の `./node_modules/.bin/takt` 前提は global CLI path では置き換える
- Package metadata: `bin`、`files`、`engines.node`、runtime `dependencies`、実行対象 script の publish/install 境界を所有する
- Validation: global install された command が既存 workflow entrypoint を呼べることを検証する
- Template manifest: package に含める `.takt/` subset と runtime state 除外ルールを所有する
- Template sync validation: package template と開発用 `.takt/workflows` / `.takt/facets` の同期状態、manifest/allowlist、禁止ファイル混入を検証する

## 境界外

- `plan / compose / polish / deliver` の成功条件や state transition は変更しない
- `slide:smoke` の mock/real provider 分離は既存 smoke validation の責務として扱い、installer spec では再定義しない
- npm publish 先、versioning policy、release note 自動化はこの spec では扱わない
- package manager ごとの差異対応は npm global install を優先し、pnpm/yarn global の互換性は必要最小限に留める
- 既存 `.takt/` を持つプロジェクトの高度な merge/migration は扱わない。eject 時の衝突検出と明示的な上書き導線に留める
- `.takt/runs/`、`.takt/render/`、`.takt/persona_sessions.json`、`.takt/session-state.json`、`.takt/workflow-current-target.json` などの runtime state は配布・eject 対象にしない
- provider 設定、API key、認証情報、ユーザ環境固有の TAKT 設定は配布・eject 対象にしない
- 対象プロジェクトに `npm install`、`npm install takt-marp`、`package.json` 変更を要求しない。必要になった場合も optional integration として扱う
- 対象プロジェクトは `.takt/workflows/**`、`.takt/facets/**`、`slides/<deck>` などの project files を持つだけでよく、local `node_modules` に依存しない
- 既存 template 対象ファイルの自動 merge、暗黙上書き、部分的な best-effort 更新は行わない
- CI に real provider smoke を必須化しない
- package template と開発用 `.takt/workflows` / `.takt/facets` の drift を放置しない
- Node.js 24 未満の runtime をサポート対象にしない

## 上流 / 下流

- **上流**: `slide-workflow-foundation`、`slide-workflow-orchestration`、`slide-workflow-smoke-validation` による既存 CLI scripts と workflow runner
- **下流**: npm package publish、外部プロジェクトへの導入、CI template、将来的な mise/Homebrew 等の配布手段

## 既存 spec との接点

- **拡張**: none
- **隣接**:
  - `slide-workflow-foundation`: runner と validation helper の契約を利用する
  - `slide-workflow-smoke-validation`: installer の smoke validation は既存 mock smoke と整合させる
  - `slide-workflow-orchestration`: workflow command 名は既存 canonical workflow に合わせる

## 制約

- プロジェクト内の spec/設計文書は日本語で書く
- `npm install -g` で command が生えることを第一要件にする
- `package.json` は `engines.node` で Node.js `>=24` を要求する
- global CLI 実行に必要な `takt`、Marp CLI、Kroki plugin などの package は `devDependencies` ではなく `dependencies` として配布対象にする
- `.takt/workflows/` と `.takt/facets/` の生成は install 時でも workflow command 実行時でもなく、利用者が対象プロジェクトで明示的に `takt-marp eject .` を実行した時だけ行う
- workflow command は project-local `.takt/workflows/` / `.takt/facets/` がない場合、package 同梱 template を使って実行し、対象プロジェクトへ template assets をコピーしない
- eject のコピー対象は curated template subset に限定し、開発元 repo の runtime state を対象プロジェクトへ持ち込まない
- eject は開発用 `.takt/` を runtime に直接コピー元として読まず、package 内の dedicated template directory をコピー元にする
- npm package の `files` と template manifest/allowlist は、bundled/eject 対象を `workflows/**` と `facets/**` だけに固定する
- `templates/project/{workflows,facets}` は配布用 canonical template として扱い、開発用 `.takt/workflows` / `.takt/facets` との差分は同期・検証 script で検出する
- template sync validation は manifest/allowlist と実ファイルが一致すること、runtime state や provider 設定などの禁止ファイルが package template に含まれないことを検証する
- `takt-marp plan|compose|polish|deliver` は対象プロジェクトを working directory として扱いつつ、runner と npm dependency resolution は global package 側を使う
- `takt-marp plan|compose|polish|deliver` は target project 側の `npm run` を呼ばず、global package 内 runner script を直接呼ぶ
- global CLI の runner execution context は `projectRoot` と `packageRoot/runtimeBin` を明示的に分離し、TAKT executable は global package 側の dependency から解決する
- existing repo-local `npm run slide:*` path が `./node_modules/.bin/takt` を使う場合でも、global CLI path は target project の `node_modules` に fallback しない
- target project には `package.json`、`node_modules`、local `takt-marp` install を要求しない
- `takt-marp plan|compose|polish|deliver` の project root は `process.cwd()` とし、親ディレクトリ探索や暗黙の root 推測は行わない
- `takt-marp eject <dir>` は明示された directory を project root として扱い、未指定時は `.` を使う
- `takt-marp eject .` は `.takt/workflows/**`、`.takt/facets/**` のコピー先に既存ファイルがある場合、デフォルトでは失敗して衝突一覧を表示する
- `takt-marp eject . --force` または `takt-marp eject . --overwrite` のような明示オプションがある場合だけ template 対象ファイルを上書きする
- eject は `.takt/runs/`、`.takt/render/`、session state、current target marker を作成・削除・上書きしない
- eject は provider 設定ファイル、API key、認証情報、ユーザ環境固有の TAKT 設定を作成・変更しない
- ejected assets は user-owned copy として扱い、takt-marp の version upgrade 時に自動置換・自動 merge しない
- 既存 `npm run slide:*` scripts は互換入口として残し、global CLI は薄い adapter に留める
- global CLI の利用者向け command surface は `eject`、`plan`、`compose`、`polish`、`deliver`、`smoke` に絞り、repo-local npm script 名である `slide:*` は global CLI command として公開しない
- `takt-marp init` は廃止済み command として扱い、利用可能 command として公開しない
- global CLI からも repo-local dependency と working directory の境界を明確にする
- global install validation は `npm pack` した tarball を一時 npm prefix に install し、実際の `takt-marp` command を PATH 経由で呼び出して確認する
- installer validation は no-copy workflow command が対象プロジェクトへ `.takt/workflows/**` と `.takt/facets/**` を生成しないことを検証する
- installer validation は `takt-marp eject .` が `.takt/workflows/**` と `.takt/facets/**` だけを生成し、`.takt/config.yaml` や runtime state を生成しないことを検証する
- installer validation は既存 template 対象ファイルがある場合の eject default failure と、`--force` / `--overwrite` による明示上書きを検証する
- `takt-marp smoke` は CI で安定するよう mock provider / deterministic path をデフォルトにし、CI 必須検証も mock provider に限定する。real provider は `--provider <name>` の明示実行とユーザ環境側の設定に依存し、CI の必須条件にしない
