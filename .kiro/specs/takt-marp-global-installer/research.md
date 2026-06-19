# 調査・設計判断: takt-marp-global-installer

更新日時: 2026-06-19(no-copy bundled template / eject 再設計)

## 要約

- **機能**: `takt-marp-global-installer`
- **ディスカバリー範囲**: 拡張(既存 global CLI / package template 実装の方針変更)
- **主要な発見**:
  - 既存実装は `init` command、`assertProjectInitialized()`、global install validator の `init-boundary` phase に強く依存しており、no-copy 実行の要求と正面から衝突する。
  - TAKT CLI の `--workflow` / `-w` は workflow 名または workflow file path を受け取れる。cwd は対象プロジェクトのまま、`templates/project/workflows/takt-marp-slide-<command>.yaml` の絶対 path を渡せば、template assets を対象プロジェクトへコピーせず workflow を実行できる。
  - workflow YAML 内の facets は workflow YAML からの相対 path (`../facets/...`) で参照されているため、bundled template root と ejected `.takt/` root のどちらでも同じ相対構造を保てば動く。
  - `eject` は既存 `initializeProject` の挙動を流用できるが、公開 API と error code は `init` 用語から切り離す必要がある。ejected assets は user-owned copy であり upgrade 時に自動 merge しない。

## 調査ログ

### 既存 CLI の init 結合

- **背景**: `init` 廃止と no-copy 実行の実装差分を把握する。
- **参照した情報源**: `scripts/lib/takt-marp-cli.mjs`、`scripts/takt-marp-validate-global-install.mjs`、`scripts/takt-marp-validate-slide-workflow-foundation.mjs`
- **発見**:
  - `VALID_COMMANDS` に `init` が含まれ、help と usage も `init` を公開している。
  - `runWorkflowCommand()` と `runApprove()` は `assertProjectInitialized()` を呼び、cwd 直下の `.takt/workflows` と `.takt/facets` がない場合 `PROJECT_NOT_INITIALIZED` で失敗する。
  - smoke は一時 project に `initializeProject()` で templates をコピーしてから検証する。
  - global install validator は `init-boundary`、`conflict-force`、`workflow-command-modes` の各 phase で `init` 前提を固定している。
- **含意**: design は `assertProjectInitialized()` の削除ではなく、`TemplateSourceResolver` による bundled/ejected 判定へ置き換える。approve は workflow/facet を必要としないため project initialization preflight を持たない。

### TAKT workflow path 指定

- **背景**: 対象プロジェクトに workflow/facet をコピーせずに TAKT workflow を実行できるかを確認する。
- **参照した情報源**: `./node_modules/.bin/takt --help`、`node_modules/takt/README.md`、`node_modules/takt/builtins/skill-codex/references/yaml-schema.md`
- **発見**:
  - TAKT help は `-w, --workflow <name>` を「Workflow name or path to workflow file」と説明している。
  - README は workflow resolution order を `.takt/workflows/` → `~/.takt/workflows/` → builtins と説明しているが、file path 指定はこの名前探索を回避できる。
  - YAML schema は facet path が workflow YAML file の directory からの相対 path として解決されることを示している。
- **含意**: bundled mode では runner が `-w <packageRoot>/templates/project/workflows/takt-marp-slide-<command>.yaml` を渡す。ejected mode では `-w <projectRoot>/.takt/workflows/takt-marp-slide-<command>.yaml` を渡す。cwd は常に対象プロジェクトなので `.takt/runs`、`workflow-current-target.json`、deck artifacts は対象プロジェクト側に生成される。

### bundled と ejected の状態判定

- **背景**: `.takt/workflows` と `.takt/facets` が片方だけある project をどう扱うかを決める。
- **参照した情報源**: requirements 2.2-2.4、`scripts/lib/takt-marp-project-templates.mjs`
- **発見**:
  - 両方ない場合は bundled template を使える。
  - 両方ある場合は user-owned ejected override として扱える。
  - 片方だけある場合、bundled workflow と ejected facet またはその逆の混在が起き、利用者が意図した override 境界が曖昧になる。
- **含意**: `resolveTemplateSource(projectRoot)` は `bundled` / `ejected` / invalid partial state の3分岐にする。partial state は `PROJECT_TEMPLATE_STATE_INVALID` で止め、`takt-marp eject . --force` か不要な片側 directory の削除を案内する。

### ProjectInitializer から ProjectEjector への置換

- **背景**: `init` command 廃止後も template copy の明示導線は必要。
- **参照した情報源**: `scripts/lib/takt-marp-project-init.mjs`
- **発見**:
  - 既存 `initializeProject({ targetDir, force })` は target directory 検証、template entries の scan-then-copy、衝突時の書き込みゼロ、`--force` 上書きを既に実現している。
  - error message と error code は `Init conflict` / `INIT_CONFLICT` であり、新しい public command と不一致。
- **含意**: 実装は `scripts/lib/takt-marp-project-eject.mjs` へ責務名を変え、`ejectProject({ targetDir, force })`、`EJECT_CONFLICT`、`EjectResult` として公開する。旧 `takt-marp-project-init.mjs` は削除または package boundary から外す。

### validator phase の再設計

- **背景**: CI が新しい利用モデルを固定する必要がある。
- **参照した情報源**: `scripts/takt-marp-validate-global-install.mjs`、`scripts/takt-marp-validate-package-boundary.mjs`
- **発見**:
  - `surface` は `init` を public command として期待している。
  - `workflow-command-modes` は未初期化 directory で `PROJECT_NOT_INITIALIZED` を期待している。
  - `REQUIRED_PACK_FILES` は `scripts/lib/takt-marp-project-init.mjs` を必須にしている。
- **含意**: validator は `surface` で `eject` 表示と `init` 非表示および removed command guidance を確認する。`workflow-command-no-copy` は `.takt/workflows` / `.takt/facets` 不在の project で workflow command が init error を出さず、template assets をコピーしないことを確認する。`eject-boundary` と `eject-conflict-force` は旧 init phase を置換する。

## アーキテクチャパターン評価

| 選択肢 | 説明 | 強み | リスク／制約 | メモ |
|--------|------|------|--------------|------|
| A: workflow/facet を一時 `.takt` にコピーして実行 | command ごとに temp root を作り TAKT に読ませる | TAKT 名解決をそのまま使える | 「eject したときだけコピー」に反する。temp と project cwd の report 位置が分離しやすい | 棄却 |
| B: `TAKT_CONFIG_DIR` など環境変数で template root を注入 | TAKT の探索 root を外から変える | CLI 側だけで完結しそう | TAKT の公開契約として確認できず、環境変数伝播が隠れた結合になる | 棄却 |
| C: workflow file path を `-w` に渡す | cwd は対象 project、workflow YAML は bundled/ejected の絶対 path | 公開 help に沿う。facet 相対 path も保持できる。template copy 不要 | TAKT file path 指定への回帰テストが必要 | 採用 |

## 設計判断

### 判断: no-copy 実行は workflow file path 指定で実現する

- **背景**: 2.2、8.3。対象 project に `.takt/workflows` / `.takt/facets` をコピーせず workflow を走らせる必要がある。
- **検討した代替案**:
  1. temp `.takt` copy — copy 境界が曖昧になる
  2. TAKT 探索 root の環境変数注入 — 公開契約として不明
  3. `-w` に workflow YAML absolute path を渡す
- **採用したアプローチ**: 案3。runner は command ごとに `TemplateSource` を解決し、TAKT へ `-w <workflowFilePath>` を渡す。
- **根拠**: TAKT help が workflow file path 指定を明示している。workflow YAML と facets の相対構造は bundled/ejected の両方で同じ。
- **トレードオフ**: TAKT の file path 指定に依存するため、global install validator と foundation validation で固定する。
- **フォローアップ**: 実装後に no-copy project で mock plan が `.takt/workflows` / `.takt/facets` を作らないことを検証する。

### 判断: project-local `.takt/workflows` と `.takt/facets` は両方揃った場合だけ override とみなす

- **背景**: 2.3、2.4。partial eject は曖昧な混在を生む。
- **検討した代替案**:
  1. 片方だけあれば不足側を bundled で補う
  2. 片方だけなら invalid state として止める
- **採用したアプローチ**: 案2。partial state は `PROJECT_TEMPLATE_STATE_INVALID`。
- **根拠**: user-owned copy と package-owned bundled template の境界を明確にできる。upgrade 時の自動 merge 禁止とも整合する。
- **トレードオフ**: 手作業で片側だけ置いた project は一度止まるが、エラーで修復方法を提示できる。

### 判断: `init` は互換 alias にせず removed command として明示失敗させる

- **背景**: 1.4。下手に alias を残すと古い運用が継続し、upgrade 時の置換え問題が残る。
- **検討した代替案**:
  1. `init` を `eject` alias とする
  2. `init` を unknown command として扱う
  3. `init` を removed command として専用 guidance を出す
- **採用したアプローチ**: 案3。help には出さず、`takt-marp init` には `COMMAND_REMOVED` で `takt-marp eject .` を案内する。
- **根拠**: ユーザーの移行体験は保ちつつ、公開 command surface からは廃止できる。

### 判断: eject 実装は init 実装をリネームして責務名を揃える

- **背景**: 3.x、4.x。copy mechanics は既存実装でほぼ満たせるが、名前が public concept とずれる。
- **採用したアプローチ**: `takt-marp-project-init.mjs` を `takt-marp-project-eject.mjs` へ移し、`initializeProject` を `ejectProject` に変更する。error code は `EJECT_CONFLICT`。
- **根拠**: 後続 task と review で `init` 残存を検出しやすくなる。
- **トレードオフ**: package boundary validator と imports の更新が必要。

### 判断: smoke は利用者 cwd を汚さず bundled template 経由で実行する

- **背景**: 6.6。smoke は検証用 workspace を使ってよいが、template copy の常用を避けたい。
- **採用したアプローチ**: CLI は temp project を作るが template assets は eject しない。fixture deck を配置し、runner の bundled fallback で workflow を実行する。summary は temp project に残す。
- **根拠**: no-copy execution path 自体を smoke でも通せる。利用者 cwd は不変。
- **トレードオフ**: smoke script 内の schema/doctor 検証が `.takt/workflows` 固定であれば bundled template root 対応へ更新する必要がある。

## 合成の結果

- **一般化**: `TemplateSource` を導入し、workflow 実行、smoke、validator が同じ bundled/ejected 判定を使う。copy mechanics は `ProjectEjector` に閉じ、workflow 実行は copy を知らない。
- **Build vs Adopt**: TAKT の既存 `-w <workflow file>` 契約を採用する。新しい workflow loader や temp staging layer は作らない。
- **単純化**: `init` alias、env var 注入、template manifest、upgrade auto-merge は導入しない。

## リスクと緩和策

- **TAKT の workflow file path 指定の挙動変更** — global install validator で bundled workflow path の mock 実行を必須化する。
- **partial `.takt` state の誤判定** — resolver の unit/foundation test で none/both/workflows-only/facets-only を固定する。
- **ejected assets の stale 化** — 自動 merge せず user-owned copy として扱う。docs/help に upgrade 追従したい場合は ejected assets を削除して bundled に戻すか、明示 `eject --force` する旨を記す。
- **validator が no-copy 実行前に target/prerequisite error で止まり workflow path を検証しない** — E2E では mock provider で小さい fixture deck の plan を完走させ、`.takt/workflows` / `.takt/facets` が作られないことを確認する。
- **旧 init 用語の残存** — `rg "\binit\b|PROJECT_NOT_INITIALIZED|INIT_CONFLICT"` を validator または package boundary の smoke check に含め、許可された deprecation guidance 以外を検出する。

## 参考資料

- `.kiro/specs/takt-marp-global-installer/requirements.md` — 更新済み要件
- `.kiro/steering/roadmap.md` — global installer が projectRoot と packageRoot/runtimeBin を分離する制約
- `scripts/lib/takt-marp-cli.mjs` — 現行 CLI dispatcher と init preflight
- `scripts/takt-marp-run-slide-workflow.mjs` — TAKT spawn と report sync の source of truth
- `scripts/lib/takt-marp-project-templates.mjs` — bundled/eject 対象 template の正本
- `./node_modules/.bin/takt --help` — `--workflow` が workflow name または file path を受け取ることの一次確認
