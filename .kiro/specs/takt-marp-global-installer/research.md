# 調査・設計判断: takt-marp-global-installer

更新日時: 2026-06-10(設計フェーズ + 設計レビュー反映)
初版: 2026-06-09(ギャップ分析フェーズ)

## 要約

- **機能**: `takt-marp-global-installer`
- **ディスカバリー範囲**: 拡張(既存 slide workflow 基盤への global CLI / packaging 統合)
- **主要な発見**:
  - 既存 lib(`scripts/lib/takt-marp-slide-workflow.mjs`)は target 検証・prerequisite・approval・freshness・rerun/force の中核契約を持ち、`options.root` による root 注入も既に可能。global CLI はこの契約を再実装せず委譲できる。
  - 最大のギャップは package 境界である。`bin` / `files` / `engines` / runtime `dependencies` が未定義で、`npm pack --dry-run` では `.agents`、`.claude`、`.kiro`、`.takt/config.yaml` など非 installer 資産が package に含まれる。
  - executable 解決は現状 `process.cwd()/node_modules/.bin/{takt,marp}` 固定であり、target project に `node_modules` を要求しない要件と衝突する。ただし解決の既定を「takt-marp package 自身の root」に変えると、repo-local(packageRoot == repo root)と global install の両方で同一の式が成立し、mode flag が不要になる。
  - facets の一部(`takt-marp-deliver-build.md`、`takt-marp-render-evidence.md`、`takt-marp-repo-conventions.md`)は `npm run build:*` や `node scripts/...` という repo-local 入口を参照している。template 内容は drift 検証で開発用 facets と同一性が強制されるため、この spec では内容を変更できない。real provider での polish/deliver 完走には上流(orchestration)側の facet 改修が必要であり、既知の制約として境界に明記する。
  - smoke script は `ROOT = path.resolve(SCRIPT_DIR, "..")` 前提で、fixture(`fixtures/marp-slide-workflow/_workflow-smoke`)と runner は SCRIPT_DIR 相対で解決する。global 経路への転用には ROOT の parameterize に加え、`npm run` 経由の 3 spawn の直接起動化と doctor 検証の takt 解決差し替えが必要(設計レビューで確定)。

## 調査ログ

### パッケージメタデータの現状

- **背景**: `npm install -g` で `takt-marp` command を提供するための package 境界を確認する。
- **参照した情報源**: `package.json`、`npm pack --dry-run --json`、`mise.toml`、`.takt/.gitignore`
- **発見**:
  - `name: takt-marp`、`version: 0.0.1`。`bin` / `files` / `engines` は未定義。
  - `@kazumatu981/markdown-it-kroki@^1.3.6`、`@marp-team/marp-cli@^4.4.0`、`takt@^0.44.0` は `devDependencies`。`@fontsource/noto-sans-jp` のみ `dependencies`。`overrides.yargs@^18` あり。
  - `npm pack --dry-run` には `.agents/**`、`.claude/**`、`.kiro/**`、`.takt/config.yaml`、scripts、fixtures 等が含まれる。runtime state の除外は `.gitignore` fallback 依存で、`files` allowlist による明示境界がない。
  - `mise.toml` は Node 24 を要求するが、CI(`.github/workflows/ci.yml`)は Node 22 で動いている。
- **含意**: `bin` / `files` / `engines.node >=24` / runtime `dependencies` 移行を package metadata として定義し、`npm pack` の実内容を検証する script が必要。CI は Node 24 へ更新する。

### 既存 runner / lib の契約

- **背景**: global CLI が `plan / compose / polish / deliver` を再実装せず委譲できるかを確認する。
- **参照した情報源**: `scripts/lib/takt-marp-slide-workflow.mjs`、`scripts/takt-marp-run-slide-workflow.mjs`
- **発見**:
  - lib は `COMMANDS`、`resolveDeckTarget(target, {root})`、`workflowPath(command, {root})`(`.takt/workflows/takt-marp-slide-<command>.yaml`)、`assertCommandPrerequisites`、approval/freshness/rerun/force helper、`SlideWorkflowError`(`CODE: message` 形式)を提供する。多くの関数は `options.root ?? process.cwd()` で root 注入可能。
  - `taktExecutablePath(options)` は `path.join(options.root ?? process.cwd(), "node_modules", ".bin", win32 ? "takt.cmd" : "takt")`(lib 116-119行)。`assertTaktExecutableAvailable` のエラーは「Run npm install and verify the takt devDependency.」で repo-local 前提。
  - runner の argv 契約は `<command> <target> [--force] [--provider <name>]`。takt は `["--pipeline", "--skip-git", "-w", "takt-marp-slide-<command>", "-t", <target>, ...provider]` で spawn され、`stdio: "inherit"`、終了コードは `process.exitCode` に伝播。`.takt/runs/**` から `slides/<deck>/review/` への report sync も runner が所有する。
  - runner は executable path/root の外部 parameter を受けず、常に cwd 基準で動く。
- **含意**: global CLI は「cwd を維持したまま package 内 runner script を子プロセスとして spawn し、argv を素通しする」だけで要件 5.x を満たせる。変更が必要なのは executable 解決の既定だけ。

### 実行ファイル解決(takt / marp)

- **背景**: target project に `node_modules` を要求せず TAKT/Marp を解決する方式を決める。
- **参照した情報源**: lib 116-132行、`scripts/takt-marp-build-slide-artifact.mjs`(115行: `process.cwd()/node_modules/.bin/marp`)、npm global install のレイアウト仕様
- **発見**:
  - `npm install -g takt-marp` では package が `<prefix>/lib/node_modules/takt-marp/` に置かれ、その `dependencies` の bin は `<prefix>/lib/node_modules/takt-marp/node_modules/.bin/` にリンクされる。
  - つまり「packageRoot(`import.meta.url` から導出)/node_modules/.bin/<tool>」という単一の式が、repo-local 開発(packageRoot == repo root)と global install の両方で成立する。
  - 子プロセス(smoke → runner)をまたいでも、各 script が自身の `import.meta.url` から packageRoot を導出できるため、env var の伝播が不要。
- **含意**: 解決の既定を cwd から packageRoot へ変更する pure な resolver module を新設し、lib と build script がそれを使う。`options.root` の明示 override は foundation validation の fake root のために維持する。

### TAKT の cwd ベース discovery

- **背景**: package 側の takt binary が target project の `.takt/workflows/**` を読めるかを確認する。
- **参照した情報源**: `.takt/config.yaml`、runner の spawn 方式、TAKT の workflow 名解決(`-w takt-marp-slide-<command>`)
- **発見**: TAKT は cwd の `.takt/` から config/workflows を発見する。binary の設置場所は discovery に影響しない。workflow YAML 内の facet 参照は `../facets/...` 相対で、`.takt/` 配下の相対構造が保たれれば成立する。
- **含意**: init が `.takt/workflows/**` と `.takt/facets/**` の相対構造を保ってコピーすれば、global takt から `-w` 名前解決が機能する見込み。最終確認は global install validation(tarball → 一時 prefix → mock smoke)が担う。

### facets の repo-local 入口参照

- **背景**: init で配布される workflow/facets が target project 単独で完結するかを確認する。
- **参照した情報源**: `.takt/facets/**` の grep
- **発見**:
  - `instructions/takt-marp-render-evidence.md`: `node scripts/takt-marp-render-slide-workflow-evidence.mjs` を実行指示。
  - `instructions/takt-marp-deliver-build.md`: `npm run build:html|pdf|pptx -- <deck>` を実行指示。
  - `knowledge/takt-marp-repo-conventions.md`: `npm run build:*` 等の repo 慣習を記述。
- **含意**: real provider で polish(render evidence)/ deliver(build)を非 npm な target project で完走させるには facet 内容の変更が必要だが、facet 責務変更はこの spec の対象外(brief / requirements 境界)であり、drift 検証は template と dev facets の同一性を強制する。よってこの制約は「既知の制限」として design に明記し、解消は上流 spec(orchestration)の follow-up とする。mock smoke は agent 実行を mock 化するため影響を受けない想定(実装時に検証)。

### smoke validation の構造

- **背景**: `takt-marp smoke` の実行対象(target project / 一時プロジェクト / package fixture)を決める。
- **参照した情報源**: `scripts/takt-marp-validate-slide-workflow-smoke.mjs`(1932行、冒頭 22-36行)
- **発見**:
  - `ROOT = path.resolve(SCRIPT_DIR, "..")`、`FIXTURE_PATH = ROOT/fixtures/marp-slide-workflow/_workflow-smoke`、`RUNNER_SCRIPT = SCRIPT_DIR/takt-marp-run-slide-workflow.mjs`。
  - `--provider` flag を受け、既定は `mock`。provider 別の summary を deck review 配下に生成する。
  - runner を `spawnSync(process.execPath, [RUNNER_SCRIPT, ...], { cwd: ROOT })` で起動し、fixture を `slides/_workflow-smoke` へコピーして検証する。
  - 【設計レビューでの追加発見】`runNpmScript`(1274-1283 行)が `npm run slide:approve`(472, 495 行)と `npm run slide:<command>`(1011 行)を `cwd: ROOT` で spawn している。また workflow doctor 検証(1637 行)が `ROOT/node_modules/.bin/takt` を直接解決している。いずれも `package.json` / `node_modules` を持たない一時 smoke プロジェクトでは成立しない。一方 `runNodeScript` / `assertNodeScriptFailure`(1285-1317 行)は SCRIPT_DIR 相対で script を解決しており、そのまま転用可能。
- **含意**: smoke の global 経路転用には ROOT の parameterize に加えて、(a) `runNpmScript` の 3 呼び出しを `runNodeScript` と同型の直接起動へ置換(`npm run` は package script の薄い wrapper であり検証意味論は不変)、(b) doctor の takt 解決を runtime context resolver 化、の 2 点が必要。fixture / runner は SCRIPT_DIR 相対のまま package 同梱資産として解決される。`npm run slide:smoke`(cwd = repo root)の挙動は不変。

### CLI 引数解析

- **背景**: 新しい dispatcher の引数解析に新規依存を追加すべきかを確認する。
- **参照した情報源**: Node.js 24 builtin `node:util` `parseArgs`、lib の `parseArgs`(`--force` / `--help` / `--key value`)
- **発見**: Node 24 の `util.parseArgs` は boolean/string option、positional、strict mode を標準提供する。既存 lib の `parseArgs` は runner 向けの簡易実装で、`--overwrite` のような新規 boolean を安全に扱う保証がない。
- **含意**: dispatcher は `node:util` の `parseArgs` を使い、新規依存を追加しない。既存 script の解析は変更しない。workflow command への引数は解析せず素通しする。

## アーキテクチャパターン評価

| 選択肢 | 説明 | 強み | リスク／制約 | メモ |
|--------|-------------|-----------|---------------------|-------|
| A: 既存 runner / smoke script を直接拡張 | 既存 script に global mode の分岐を追加 | 新規ファイル最小 | 1932 行の smoke script へ installer 関心事が混入し、mode flag が増殖する | 棄却 |
| B: 専用 installer コンポーネント群 | CLI / init / template / validation を独立 module 化 | 境界が明確、独立テスト可能 | runner 契約の重複実装リスク | 単独では runner 委譲の設計が別途必要 |
| C: ハイブリッド(採用) | B の専用 module 群 + 既存 runner への委譲 + 最小の resolver 共有 | 既存契約を source of truth に保ち、installer 固有関心事を新規境界に隔離 | runtime context の設計規律が必要 | packageRoot 既定化により mode flag なしで両経路が成立 |

## 設計判断

### 判断: 実行ファイル解決は packageRoot 既定の pure resolver に一本化する

- **背景**: 要件 4.3 / 5.1。target project の `node_modules` に依存せず takt/marp を解決しつつ、repo-local 実行を壊さない。
- **検討した代替案**:
  1. env var(`TAKT_MARP_RUNTIME_BIN` 等)で bin dir を子プロセスへ伝播 — 伝播経路の管理が増える
  2. `createRequire().resolve("takt/package.json")` + `bin` field 解決 — Windows shim の再実装が必要
  3. packageRoot(`import.meta.url` 由来)`/node_modules/.bin/<tool>` — 既存のプラットフォーム分岐をそのまま流用できる
- **採用したアプローチ**: 案3。pure な `takt-marp-runtime-context.mjs` を新設し、`taktExecutablePath` / build script の marp 解決の既定 root を cwd から packageRoot へ変更する。`options.root` override は維持。
- **根拠**: repo-local では packageRoot == repo root のため挙動互換。global install では npm が package 配下の `node_modules/.bin` に依存 bin をリンクするため同式が成立。env 伝播も mode flag も不要。
- **トレードオフ**: pnpm/yarn global の非標準レイアウトでは `.bin` が存在しない可能性がある(境界外: npm 優先、互換は最小限)。npm レイアウト依存は global install validation(8.1)が tarball E2E で検証する。
- **フォローアップ**: foundation validation の fake root(`options.root` 利用)が引き続き通ることを実装時に確認する。

### 判断: `takt-marp smoke` は一時プロジェクトを生成して既存 smoke script に委譲する

- **背景**: 要件 6.1-6.5 / 8.4。ギャップ分析の未解決事項「smoke の実行対象」。
- **検討した代替案**:
  1. 利用者 cwd で実行 — `slides/_workflow-smoke` や `.takt/runs` で利用者 project を汚染する
  2. package root で実行 — global install 先は書き込み不可の場合があり、install 内容を汚染する
  3. `mkdtemp` した一時プロジェクトに init + fixture で実行(採用)
- **採用したアプローチ**: CLI の smoke subcommand が一時 directory を作成し、initializer で `.takt/workflows/**` / `.takt/facets/**` を導入後、smoke script を cwd=一時プロジェクトで spawn する。smoke script への変更は 3 点: (1) `ROOT` の `process.cwd()` 基準化(fixture / runner は SCRIPT_DIR 相対のまま)、(2) `runNpmScript` の 3 呼び出しを `process.execPath` 直接起動へ置換、(3) workflow doctor の takt 解決を runtime context resolver 化。一時プロジェクトは検証結果(provider 別 summary)の置き場として保持し、path を表示する。
- **根拠**: `npm run slide:smoke`(cwd = repo root)の挙動は不変(`npm run` 置換は同一 script の直接起動であり検証意味論を変えない)。global 経路は決定論的かつ利用者 project 非破壊。6.2/6.4 の provider 別検証結果は既存 smoke の summary 生成をそのまま流用できる。roadmap が認める smoke の upstream 最小修正の範囲に収まる。
- **トレードオフ**: smoke script への変更が ROOT 1 点ではなく 3 点に増える(設計レビューで `npm run` spawn と ROOT 基準の takt 解決が判明したため)。SCRIPT_DIR 以外から直接 node 実行した場合の挙動が変わるが、公開入口(`npm run slide:smoke` / `takt-marp smoke`)では同一。
- **フォローアップ**: TAKT が `.takt/config.yaml` 不在で実行できるか(`--provider mock` 指定時 / 未指定時)、`workflow_command_gates.custom_scripts` 不在の影響を、smoke 経路と workflow command 経路の両方で実装時に検証する。smoke は不可の場合に限り一時プロジェクト内に ephemeral な最小 config を生成する(利用者 project への config 生成は行わない。init の禁止事項 2.3/2.4 は不変)。利用者経路は global install validator で失敗モードを観測・固定し、init 成功時の案内で次手順を補う。

### 判断: template 境界は「template directory + hardcoded allowlist + 禁止 pattern」で表現し、独立 manifest file を持たない

- **背景**: 要件 7.1 / 7.2 / 7.5。brief の「template manifest または hardcoded allowlist」。
- **検討した代替案**:
  1. manifest file(JSON 等)で配布対象を列挙 — manifest 自体が drift する第3の正本になる
  2. template directory の実体 + code 内 allowlist(`workflows/`, `facets/`)+ 禁止 pattern(採用)
- **採用したアプローチ**: `templates/project/{workflows,facets}` の実体を配布正本とし、`takt-marp-project-templates.mjs` が domain allowlist と禁止 pattern(`config.yaml`、`runs/`、`render/`、`persona_sessions.json`、`session-state.json`、`workflow-current-target.json`、credential 類)を所有する。initializer / drift 検証 / package 境界検証はすべて同じ module を使う。
- **根拠**: 正本を2つ(directory と manifest)にしないことで drift 検証対象を減らす。allowlist は要件上固定(`workflows/**` と `facets/**` のみ)なので hardcode が最も単純で安全。
- **トレードオフ**: 配布対象 domain を増やす際は code 変更が必要(意図的な摩擦として許容)。

### 判断: drift 検出は path 集合 + byte 単位内容比較とする

- **背景**: 要件 7.3 / 7.4。ギャップ分析の未解決事項「比較方式」。
- **検討した代替案**: byte-for-byte(採用)/ manifest hash / normalize 比較
- **採用したアプローチ**: `templates/project/{workflows,facets}` と開発用 `.takt/{workflows,facets}` の相対 path 集合の差(template 欠落 / dev 欠落)と、共通 path の byte 単位内容差を検出し、drift path 一覧を表示して失敗する。同期は同一 script の `--write` で dev → template 方向に行う。
- **根拠**: 対象は小さい text file 群であり、normalize で差異を隠すと「禁止ファイル混入」や「実質 drift」を見逃す。hash manifest は前項の判断と同じ理由で持たない。
- **トレードオフ**: 改行 code 等の機械的差異も drift 扱いになるが、同 repo 内の copy 運用では発生しにくく、発生時は `--write` で解消できる。

### 判断: `--force` と `--overwrite` は完全 alias、`--force` を canonical とする

- **背景**: 要件 3.3 / 3.4。ギャップ分析の未解決事項。
- **採用したアプローチ**: 両方を受理し挙動は同一。help では `--force` を canonical として表示し、`--overwrite` は alias 表記。
- **根拠**: 既存 runner の force invalidation で `--force` が既に使われており、語彙を統一する。

### 判断: workflow command / smoke は子プロセス spawn で委譲し、runner を importable API へ再構成しない

- **背景**: 要件 5.1 / 5.5 / 4.5。既存 runner は top-level script で `stdio: inherit` / `process.exitCode` 前提。
- **検討した代替案**:
  1. runner を関数化して in-process 呼び出し — runner の大規模 refactor が必要で、5.5(契約再定義禁止)に対しリスク
  2. `process.execPath` で package 内 script を spawn、cwd 維持、argv 素通し、exit code 伝播(採用)
- **採用したアプローチ**: 案2。CLI adapter は `plan|compose|polish|deliver` で cwd をそのまま project root として runner script を spawn し、残りの argv(`--force`、`--provider` 等)を検証せず素通しする。`npm run` は経由しない。
- **根拠**: runner の argv / exit code / report sync 契約が source of truth のまま保たれ、CLI は薄い adapter に留まる(brief 制約)。
- **トレードオフ**: プロセス起動 overhead(無視できる)。CLI 独自の引数検証をしないため、runner のエラーメッセージがそのまま利用者に見える(5.2 はむしろこれを要求している)。

### 判断: 未初期化検出は CLI adapter が所有し、workflow 個別ファイルの検証は runner に残す

- **背景**: 要件 4.2 / 4.4 と、既存 `assertWorkflowAvailable`(`WORKFLOW_NOT_IMPLEMENTED`)の役割分担。
- **採用したアプローチ**: CLI は workflow command の dispatch 前に cwd 直下の `.takt/workflows/` と `.takt/facets/` の存在だけを確認し、欠落時は `PROJECT_NOT_INITIALIZED` として `takt-marp init .` を案内する。親 directory 探索は行わない。個別 workflow YAML の存在検証・target 検証・prerequisite 検証は従来どおり runner/lib が行う。
- **根拠**: 「未初期化」という導入境界の概念は installer が所有し、「workflow 契約」の検証は既存 spec が所有する、という責務の縫い目が明確になる。

### 判断: package include 境界は `files` allowlist 単独とし、`.npmignore` は使わない

- **背景**: 要件 7.5 / 8.1。ギャップ分析の「include policy」未解決事項。
- **採用したアプローチ**: `package.json` の `files` に `bin/`、`scripts/`、`templates/`、`fixtures/marp-slide-workflow/`、`marp.config.mjs` を列挙する(README / LICENSE / package.json は npm が自動同梱)。package 境界検証 script が `npm pack --dry-run --json` の実出力を allowlist / 禁止 pattern と突合する。
- **根拠**: allowlist は deny-list より安全側に倒れる。`.npmignore` 併用は正本を2つにする。
- **トレードオフ**: 新しい配布資産を追加するたびに `files` 更新が必要(検証 script が不一致を失敗として検出する — 7.5 の意図どおり)。

## 合成の結果(synthesis)

- **一般化**: (1) 「project root(cwd)と package root(import.meta.url 由来)の分離」を単一の RuntimeContext 概念に集約し、CLI / lib / build / smoke が共有する。(2) 「配布 template の境界定義」を単一の template set module に集約し、initializer / drift 検証 / package 境界検証の3消費者が共有する。実装は現要件の範囲に留め、interface のみ一般化する。
- **Build vs Adopt**: 引数解析は `node:util parseArgs`(builtin)を採用し新規依存ゼロ。global install 検証は npm 自身(`npm pack` + `npm install -g --prefix`)を採用。template copy / 比較は `node:fs` のみで構築(対象が小規模 text file 群のため library 不要)。
- **単純化**: manifest file なし、env var 伝播なし、runner の importable 化なし、`--keep` のような speculative flag なし、smoke summary filename への CLI 側結合なし(smoke script の出力をそのまま提示)。

## リスクと緩和策

- **npm global レイアウト依存**(packageRoot/node_modules/.bin が存在しない環境)— global install validation(8.1)が tarball E2E で検出する。pnpm/yarn global は境界外(npm 優先)と明記。
- **TAKT が config.yaml 不在で実行できない可能性(smoke 一時プロジェクトと利用者 target project の両方)** — 実装時に両経路で検証する。smoke は必要なら一時プロジェクト内に限り ephemeral config を生成(利用者 project には生成しない)。利用者経路は global install validator が config 不在時の失敗モードを観測・固定し、init 成功メッセージの次手順案内(provider 設定はユーザ所有)で導入体験を補う。
- **facets の repo-local 入口参照により、real provider の polish/deliver が非 npm target project で完走しない** — 本 spec の境界外(facet 責務変更は orchestration 所有)。design の既知の制限と再検証トリガーに明記し、mock smoke への影響有無を実装時に確認する。
- **`devDependencies` → `dependencies` 移行と `overrides.yargs` の相互作用** — lockfile 再生成と `npm ci` / global install の両経路を CI で検証する。
- **既定 root 変更(cwd → packageRoot)による foundation validation への影響** — `options.root` override を維持し、`npm test`(slide:validate-foundation)を回帰ゲートにする。
- **CI 時間増**(repo-local smoke + global install validation の二重 mock smoke)— 8.x が global 経路の検証を明示要求しているため許容。必要になれば global 側の smoke 範囲を絞る最適化は follow-up。

## 参考資料

- `.kiro/specs/takt-marp-global-installer/brief.md` — 機能ブリーフ(アプローチ・境界候補)
- `.kiro/specs/takt-marp-global-installer/requirements.md` — 承認済み要件
- `.kiro/steering/roadmap.md` — workflow 再設計の制約(runner executable 解決の置き換えを当 spec が担うことを明記)
- `docs/marp-slide-workflow-redesign/design.md` — 既存 workflow の設計(契約の source of truth)
- [npm Docs: package.json `files` / `bin` / `engines`](https://docs.npmjs.com/cli/v10/configuring-npm/package-json) — package 境界の仕様
- [Node.js `util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig) — builtin 引数解析
