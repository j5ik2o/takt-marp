# 技術設計書: slide-workflow-research

## 概要

**Purpose（目的）**: 本機能は deck 作成者に、slide 制作 workflow とは独立した任意の deep research 段階を提供し、調査結果を `plan` の補助文脈として安全に渡す価値を提供する。

**Users（ユーザー）**: deck 作成者が外部調査を要する講義・登壇・解説資料を作るときに利用する。workflow メンテナが command/state/report/template の配布境界を保守するためにも利用する。

**Impact（影響）**: 現在の `plan / compose / polish / deliver` に、任意の前段 `research` を追加する。既存 successful state、approval、review artifact は維持し、research 成果物は `slides/<deck>/research/` に隔離する。research の探索そのものは TAKT built-in `deep-research` を正本として使い、repo-local では再実装しない。

### 目標

- `takt-marp research slides/<deck>` を任意 command として提供する。
- TAKT built-in `deep-research` を最大限活用し、repo-local は薄い wrapper と deck-local artifact adapter だけを所有する。
- `research` の入力・成果物・supervision を deck-local `research/` domain に閉じる。
- `plan` は `brief.md` primary input を維持し、research artifacts を任意入力として扱う。
- bundled/ejected template、validation、smoke の surface を揃える。

### 非目標

- `plan / compose / polish / deliver` の state 名、approval ownership、既存 report schema の再設計
- `research` を全 deck の必須前提にすること
- deep research engine、persona、policy、report contract の repo-local fork
- PPTX/PDF を research workflow の中核 artifact にすること
- 既存 deck の自動再生成

## 境界コミットメント

### このスペックが所有するもの

- `research` command の CLI 表示、target validation、TAKT workflow 起動、rerun/force behavior
- `research` command の state `researched` と `research-supervision.md` validation
- TAKT built-in `deep-research` を呼ぶ `takt-marp-slide-research.yaml` wrapper
- CLI target、research brief target、deck-local output dir を結ぶ runner handoff contract
- selected TAKT run から built-in `research-report.md` を一意に特定する source report locator
- built-in `research-report.md` から deck-local research artifacts を派生する adapter contract
- `slides/<deck>/research/` 配下の input/output contract:
  - `research-brief.md`
  - `research-report.md`
  - `research-sources.md`
  - `research-claims.md`
  - `open-questions.md`
  - `research-supervision.md`
- `plan` workflow/facets が research artifacts を任意文脈として読む契約
- bundled/ejected templates と validation scripts の research 追加分

### 境界外

- TAKT built-in `deep-research` の内部 step、persona、policy、output contract の再実装
- built-in research facets の repo-local コピー
- 通常 workflow の外部 web access 許可拡大
- `brief.md` の primary input 性質の変更
- `compose / polish / deliver` の prerequisite、approval、supervision contract の変更
- `.coderabbit.yml` / `.coderabbit.yaml` の変更
- 「ついでに」取り込まない変更: visual review、PPTX/PDF QA、Atomic Design component taxonomy の追加再設計

### 許可する依存

- TAKT built-in workflow name `deep-research`
- `node_modules/takt/builtins/ja/workflows/deep-research.yaml`
- `node_modules/takt/builtins/ja/facets/output-contracts/research-report.md`
- TAKT `workflow_call` の built-in workflow 名解決
- 既存 `.takt/workflow-current-target.json` marker に research 固有 field を追加する方式
- 既存 `reports/subworkflows/**` 探索パターン
- 既存 target resolver、front matter parser、TAKT executable resolver
- `scripts/lib/takt-marp-project-templates.mjs` の bundled/ejected template resolver
- `templates/project/workflows/**` と `templates/project/facets/**` の sync/check mechanism
- `scripts/takt-marp-validate-slide-workflow-foundation.mjs` と `scripts/takt-marp-validate-slide-workflow-smoke.mjs`

違反してはならない依存制約:

- `research` 成果物を `slides/<deck>/review/` の既存 command state と混ぜない。
- `plan` 成功条件に external web access を追加しない。
- `research --force` で plan/compose/polish/deliver の approval を退避しない。
- repo-local adapter step は built-in report からの抽出・整形だけを行い、追加調査や再評価をしない。
- repo-local adapter step は built-in report に存在しない URL、取得日、確度、claim/source 対応を補完しない。欠落値は `not_present_in_builtin_report` として明示する。

### 再検証トリガー

- `CommandConfigRegistry` の metadata shape 変更
- `research-supervision.md` front matter contract の変更
- `slides/<deck>/research/` の artifact 名または配置変更
- TAKT built-in `deep-research` の output file 名変更
- TAKT `workflow_call` の built-in workflow 名解決仕様変更
- template resolver の bundled/ejected 判定変更
- `plan` の prerequisite または source artifact sync の変更

## アーキテクチャ

### 既存アーキテクチャ分析

既存 slide workflow は `plan / compose / polish / deliver` の4 command を前提に、以下を scripts と workflow/facets が分担している。

- `scripts/lib/takt-marp-slide-workflow.mjs`: command list、state、approval support、target validation、front matter validation、force archive
- `scripts/takt-marp-run-slide-workflow.mjs`: workflow path 解決、TAKT 起動、report/source artifact sync
- `scripts/lib/takt-marp-cli.mjs`: top-level command routing、bundled/ejected workflow template の選択
- `.takt/workflows/**` と `templates/project/workflows/**`: TAKT workflow definitions
- validation scripts: runner behavior、template resolution、smoke path、static workflow constraints

注意点は `downstreamCommands(command)` が `COMMANDS` 配列の順序を使うことである。`research` を先頭追加すると `research --force` が既存 command の artifacts を退避しうるため、command behavior を明示 metadata にする。

TAKT 側には built-in `deep-research` が存在し、research persona、policy、knowledge、output contract を既に持つ。本設計はこれを `workflow_call` で呼び、slide workflow 固有の artifact 同期だけを repo-local に置く。

### アーキテクチャパターンと境界マップ

採用パターン: command metadata registry + built-in workflow call + deck artifact adapter。既存 helper exports は維持しつつ、内部の判断を registry へ集約する。

```mermaid
graph TB
    User[User] --> CLI[CLI]
    CLI --> Resolver[Template Resolver]
    CLI --> Runner[Workflow Runner]
    Runner --> Registry[Command Registry]
    Runner --> Wrapper[Research Wrapper]
    Wrapper --> Builtin[Deep Research]
    Builtin --> Reports[TAKT Reports]
    Reports --> Adapter[Research Adapter]
    Adapter --> ResearchDir[Research Dir]
    ResearchDir --> Plan[Plan Optional Context]
```

**Architecture Integration（アーキテクチャ統合）**:

- 採用パターン: `research` を既存 review state へ混ぜず、command metadata で artifact domain と invalidation scope を分離する。
- ドメイン／機能境界: `research` domain は調査入力・built-in report・派生成果物・調査 supervision を所有する。`review` domain は既存 slide workflow state を所有し続ける。
- 維持する既存パターン: `slides/<deck>` target contract、front matter parser、atomic replace、package-bundled/ejected template selection、`--skip-git` TAKT 起動。
- 新規コンポーネントの根拠: command metadata registry は `research` の異なる invalidation/report domain を if 文の散在なしに表現するため必要。Research Adapter は built-in report を requirements が求める deck-local files へ写像するためだけに必要。
- ステアリング準拠: roadmap の canonical command/state model を壊さず、follow-up として任意前段 research を追加する。

### Research Handoff Contract

`research` の user-facing target は常に `slides/<deck>` とする。Runner は既存 target resolver で deck を検証したうえで、TAKT 実行だけ次の target に変換する。

```text
CLI target:        slides/<deck>
TAKT target:       slides/<deck>/research/research-brief.md
output directory:  slides/<deck>/research/
state target:      slides/<deck>
```

Runner は TAKT 起動前に `.takt/workflow-current-target.json` を次の shape で書く。

```json
{
  "command": "research",
  "target": "slides/<deck>",
  "deck": "<deck>",
  "research_brief_path": "slides/<deck>/research/research-brief.md",
  "research_output_dir": "slides/<deck>/research",
  "research_source_report_name": "research-report.md",
  "started_at": "<ISO-8601>"
}
```

この marker は wrapper、adapter、supervision が deck target と research brief target を混同しないための handoff であり、template 配布対象には含めない。`plan / compose / polish / deliver` の marker shape は既存互換を維持し、research 固有 field は追加しない。

### Research Source Report Locator

`research-report.md` は built-in `deep-research` の output を正本とする。Runner は TAKT 成功後、まず `research-supervision.md` の front matter で selected parent reports directory を一意に決める。そのうえで、source report は selected parent reports directory の内側だけから探索する。

探索順は次の通りである。

1. `<reportsDir>/subworkflows/**/research-report.md` のうち、ancestor directory 名に `workflow-deep-research` を含むもの。
2. 互換 fallback として `<reportsDir>/research-report.md`。

一致が 0 件なら `TAKT_SOURCE_ARTIFACT_SYNC_MISSING`、2 件以上なら `TAKT_SOURCE_ARTIFACT_SYNC_AMBIGUOUS` で失敗する。Runner はこの source report を `slides/<deck>/research/research-report.md` へ byte-for-byte copy し、adapter が再生成した report では置き換えない。

### 技術スタック

| レイヤー | 選択／バージョン | 機能内での役割 | メモ |
|----------|------------------|----------------|------|
| CLI | Node.js ESM scripts | `research` command routing | 既存 CLI に追加 |
| Workflow runtime | TAKT `^0.44.0` built-in `deep-research` | 調査実行 | repo-local fork なし |
| Artifact storage | Markdown under `slides/<deck>/research/` | deck-local source/evidence | Git 管理可能 |
| Validation | 既存 Node validation scripts | state/report/template/smoke 検証 | 新規依存なし |
| Template distribution | `.takt/**` + `templates/project/**` | bundled/ejected 両対応 | sync/check 対象 |

## ファイル構造計画

### ディレクトリ構造

```text
.kiro/specs/slide-workflow-research/
├── spec.json
├── requirements.md
├── research.md
└── design.md

.takt/
├── workflows/
│   ├── takt-marp-slide-research.yaml
│   └── takt-marp-slide-plan.yaml
└── facets/
    ├── instructions/
    │   ├── takt-marp-research-adapt.md
    │   └── takt-marp-plan.md
    └── output-contracts/
        └── takt-marp-supervision.md

templates/project/
├── workflows/
│   └── takt-marp-slide-research.yaml
└── facets/
    └── instructions/
        └── takt-marp-research-adapt.md

slides/<deck>/
├── brief.md
└── research/
    ├── research-brief.md
    ├── research-report.md
    ├── research-sources.md
    ├── research-claims.md
    ├── open-questions.md
    ├── research-supervision.md
    └── history/
```

### 変更対象ファイル

- `scripts/lib/takt-marp-slide-workflow.mjs` — `Command Config Registry` を導入し、既存 exports を registry から派生させる。`research` の artifact domain、archive 対象、source artifact 定義を command metadata で扱う。
- `scripts/takt-marp-run-slide-workflow.mjs` — usage に `research` を追加し、research handoff marker、research brief TAKT target、built-in source report locator、`Research Artifact Sync` を artifact domain 別に扱う。`research` は `slides/<deck>/research/` に同期する。
- `scripts/lib/takt-marp-cli.mjs` — `WORKFLOW_COMMANDS` と help に `research` を追加し、bundled/ejected workflow path 解決を既存 command と同じ経路に載せる。
- `scripts/lib/takt-marp-project-templates.mjs` — `Template Distribution` の command list に `research` を含める。
- `.takt/workflows/takt-marp-slide-research.yaml` — `Research Workflow Wrapper`。`kind: workflow_call` と `call: deep-research` で built-in を呼び、adapter step と supervision step だけを repo-local に置く。
- `.takt/facets/instructions/takt-marp-research-adapt.md` — `Research Adapter` の instruction。built-in `research-report.md` から deck-local artifacts を抽出し、追加調査は行わない。
- `.takt/workflows/takt-marp-slide-plan.yaml` — `Plan Optional Context`。research artifacts が存在する場合に optional context として読むように instruction context を追加する。prerequisite は変更しない。
- `.takt/facets/instructions/takt-marp-plan.md` — `Plan Optional Context` の根拠識別、未解決事項の扱いを追加する。
- `.takt/facets/output-contracts/takt-marp-supervision.md` — `Research Supervision Validator` のため、`command: research` と `state: researched` を許容する。
- `templates/project/workflows/takt-marp-slide-research.yaml` と `templates/project/facets/instructions/takt-marp-research-adapt.md` — `Template Distribution`。`npm run installer:sync-templates` で同期する。手編集は避ける。
- `scripts/takt-marp-validate-slide-workflow-foundation.mjs` — `Validation Surface`。registry、research prerequisite、force archive、bundled/ejected path、artifact sync の deterministic checks を追加する。
- `scripts/takt-marp-validate-slide-workflow-smoke.mjs` — `Validation Surface`。research 追加後も既存 4 command path が維持されること、mock research が research domain に artifact を置くことを確認する。
- `docs/marp-slide-workflow.md` — `Plan Optional Context` と `research` の任意性を追記する。
- `docs/marp-slide-workflow-reports.md` — `Research Supervision Validator` と research artifacts の contract を追記する。
- `package.json` — `slide:research` script を追加する。既存 scripts 名は変えない。

## システムフロー

### research 実行

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant Runner
    participant Wrapper
    participant Builtin
    participant Adapter
    participant ResearchDir

    User->>CLI: research deck
    CLI->>Runner: command target workflow
    Runner->>ResearchDir: validate brief
    Runner->>Runner: write handoff marker
    Runner->>Wrapper: run workflow with research-brief target
    Wrapper->>Builtin: call deep research with research-brief target
    Builtin->>Wrapper: emit built-in research-report
    Wrapper->>Adapter: derive index artifacts from built-in report
    Wrapper->>Runner: emit research-supervision
    Runner->>Runner: locate built-in research-report
    Runner->>ResearchDir: sync report, indexes, supervision
```

Adapter は built-in report の内容だけを構造化する。追加の web 調査、追加の主張生成、出典の再評価は行わない。Runner は built-in report を直接 copy し、adapter 出力で `research-report.md` を置換しない。

### plan 任意参照

```mermaid
flowchart LR
    Brief[Brief] --> Plan[Plan Workflow]
    Report[Research Report] -.-> Plan
    Claims[Research Claims] -.-> Plan
    Questions[Open Questions] -.-> Plan
    Plan --> Artifacts[Plan Artifacts]
```

`plan` は `brief.md` を常に primary input とする。research artifacts がある場合だけ参照し、無い場合は従来どおり進む。

### force invalidation

```mermaid
flowchart TB
    ResearchForce[Research Force] --> ResearchHistory[Research History]
    ResearchForce --> KeepReview[Keep Review]
    PlanForce[Plan Force] --> ReviewHistory[Review History]
```

`research --force` は research domain のみ退避する。`plan --force` 以降の既存挙動は変えない。

## 要件トレーサビリティ

| 要件 | 要約 | コンポーネント | インターフェース | フロー |
|------|------|----------------|------------------|--------|
| 1.1 | research target validation | CLI, Workflow Runner, Command Config Registry | `resolveDeckTarget` | research 実行 |
| 1.2 | workflow unavailable error | Workflow Runner, Template Distribution | `assertWorkflowAvailable`, `assertBuiltinWorkflowAvailable` | research 実行 |
| 1.3 | plan does not require research | Plan Optional Context | `assertCommandPrerequisites` | plan 任意参照 |
| 1.4 | existing prerequisites kept | Command Config Registry | command prerequisite map | plan 任意参照 |
| 1.5 | CLI help distinction | CLI | usage text | research 実行 |
| 2.1 | research brief primary input | Workflow Runner | `researchTaktTarget` | research 実行 |
| 2.2 | missing research brief error | Workflow Runner | `PREREQUISITE_MISSING` | research 実行 |
| 2.3 | brief.md untouched | Research Artifact Sync | source artifact map | research 実行 |
| 2.4 | plan ignores research brief absence | Plan Optional Context | optional reads | plan 任意参照 |
| 3.1 | research report output | Research Artifact Sync | source report locator | research 実行 |
| 3.2 | sources output | Research Adapter | `research-sources.md` | research 実行 |
| 3.3 | claims output | Research Adapter | `research-claims.md` | research 実行 |
| 3.4 | open questions output | Research Adapter | `open-questions.md` | research 実行 |
| 3.5 | URL/date/fact separation | Research Adapter | derived artifact sections | research 実行 |
| 4.1 | research supervision output | Research Supervision Validator | `research-supervision.md` | research 実行 |
| 4.2 | researched state | Command Config Registry, Research Supervision Validator | `state: researched` | research 実行 |
| 4.3 | rerun blocked | Workflow Runner | `isSuccessfulCommandState` | force invalidation |
| 4.4 | force archive research | Workflow Runner | research domain archive | force invalidation |
| 4.5 | do not archive plan artifacts | Command Config Registry | `invalidationTargets` | force invalidation |
| 4.6 | rejected rerun | Workflow Runner | rejected archive path | force invalidation |
| 5.1 | brief primary | Plan Optional Context | `brief.md` | plan 任意参照 |
| 5.2 | optional research context | Plan Optional Context | optional files | plan 任意参照 |
| 5.3 | missing research does not fail | Plan Optional Context | optional reads | plan 任意参照 |
| 5.4 | cite research origin | Plan Optional Context | `reference-analysis.md` | plan 任意参照 |
| 5.5 | open questions not fabricated | Plan Optional Context | unresolved assumptions | plan 任意参照 |
| 6.1 | web access limited | Research Workflow Wrapper | built-in workflow call | research 実行 |
| 6.2 | no web success condition in normal flow | Plan Optional Context | unchanged workflows | plan 任意参照 |
| 6.3 | source timestamp | Research Adapter | source extraction | research 実行 |
| 6.4 | external failure isolated | Workflow Runner, Command Config Registry | command result domain | research 実行 |
| 6.5 | no local fork | Research Workflow Wrapper | `call: deep-research` | research 実行 |
| 7.1 | bundled template | Template Distribution | package workflow path | research 実行 |
| 7.2 | ejected template | Template Distribution | project workflow path | research 実行 |
| 7.3 | eject copies research | Template Distribution | templates/project | research 実行 |
| 7.4 | validation coverage | Validation Surface | foundation validation | force invalidation |
| 7.5 | smoke keeps existing flows | Validation Surface | smoke validation | plan 任意参照 |
| 7.6 | template drift detection | Template Distribution | installer check | research 実行 |

## コンポーネントとインターフェース

| コンポーネント | ドメイン／レイヤー | 意図 | 要件カバー範囲 | 主要依存 | 契約 |
|----------------|--------------------|------|----------------|----------|------|
| Command Config Registry | CLI core | command behavior を一元化 | 1.1, 1.3, 1.4, 4.2, 4.3, 4.4, 4.5 | existing helpers | State |
| Workflow Runner | Runtime | command preflight と TAKT 起動を行う | 1.1, 1.2, 2.1, 2.2, 4.3, 4.6, 6.4 | Command Config Registry | Batch |
| Research Workflow Wrapper | TAKT workflow | built-in deep research を呼ぶ | 1.2, 3.1, 6.1, 6.5 | TAKT built-in | Batch |
| Research Adapter | TAKT workflow | built-in report から deck artifacts を派生する | 3.2, 3.3, 3.4, 3.5, 6.3 | built-in report | Batch |
| Research Artifact Sync | Runtime | research domain へ成果物を同期する | 2.1, 2.3, 3.1, 4.1, 4.4 | TAKT reports | Batch |
| Research Supervision Validator | CLI core | `researched` state を検証する | 4.1, 4.2, 4.6 | front matter parser | State |
| Plan Optional Context | Workflow facets | research を任意入力として読む | 2.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.2 | plan workflow | Batch |
| Template Distribution | Installer templates | bundled/ejected 両方で research workflow を利用可能にする | 7.1, 7.2, 7.3, 7.6 | template resolver | Batch |
| Validation Surface | scripts | regression と smoke を保証する | 7.4, 7.5 | validation scripts | Batch |

### CLI core

#### Command Config Registry

| 項目 | 詳細 |
|------|------|
| 意図 | command ごとの state、artifact domain、approval、invalidation scope を定義する |
| 要件 | 1.1, 1.3, 1.4, 4.2, 4.3, 4.4, 4.5 |

**責務と制約**

- `research / plan / compose / polish / deliver` の metadata を単一 source of truth とする。
- 既存 exports `COMMANDS`、`COMMAND_STATES`、`APPROVAL_COMMANDS` は互換のため維持する。
- `research` は `approvalSupported: false`、`artifactDomain: "research"`、`invalidationTargets: ["research"]` とする。
- `plan` の prerequisite は `brief.md` のみであり、research state を要求しない。

**契約種別**: Service [x] / State [x]

##### サービスインターフェース

```typescript
type CommandName = "research" | "plan" | "compose" | "polish" | "deliver";
type ArtifactDomain = "research" | "review";

interface CommandConfig {
  name: CommandName;
  successfulState: "researched" | "planned" | "composed" | "polished" | "delivered";
  artifactDomain: ArtifactDomain;
  approvalSupported: boolean;
  invalidationTargets: CommandName[];
  sourceArtifacts: string[];
}

interface CommandConfigRegistry {
  requireCommand(command: string): CommandName;
  configFor(command: CommandName): CommandConfig;
  downstreamCommands(command: CommandName): CommandName[];
}
```

- Preconditions（事前条件）: command string は CLI positional から渡される。
- Postconditions（事後条件）: unsupported command は `INVALID_COMMAND` で失敗する。
- Invariants（不変条件）: `research` の downstream は `research` のみ。

#### Research Supervision Validator

| 項目 | 詳細 |
|------|------|
| 意図 | research supervision を既存 front matter parser で検証する |
| 要件 | 4.1, 4.2, 4.3, 4.6 |

**責務と制約**

- `research-supervision.md` は `slides/<deck>/research/` から読む。
- `result: passed` の場合に `state: researched` を要求する。
- `blocking_findings` など既存 supervision count fields を再利用する。

**契約種別**: State [x]

### Runtime

#### Workflow Runner

| 項目 | 詳細 |
|------|------|
| 意図 | research preflight、TAKT 起動、成功済み rerun 判定を既存 runner に統合する |
| 要件 | 1.1, 1.2, 2.1, 2.2, 4.3, 4.6, 6.4 |

**責務と制約**

- `research-brief.md` が無い場合、TAKT 起動前に失敗する。
- `research` 実行時は wrapper workflow template と built-in workflow `deep-research` の両方を TAKT 起動前に検証する。
- user-facing target は `slides/<deck>` のまま維持し、TAKT target だけを `slides/<deck>/research/research-brief.md` に変換する。
- `.takt/workflow-current-target.json` に `target`、`research_brief_path`、`research_output_dir` を書き、wrapper と adapter の handoff を明示する。
- external research failure は `research` command の失敗として扱い、既存 `plan` state を変更しない。
- selected workflow path は Template Distribution から受け取り、bundled/ejected のどちらでも同じ runner を使う。

**契約種別**: Batch [x]

##### バッチ／ジョブ契約

- Trigger（トリガー）: `takt-marp research slides/<deck>`
- Input / validation（入力／検証）: `slides/<deck>/research/research-brief.md` と `slides/<deck>` target
- Output / destination（出力／宛先）: selected parent reports directory と source report locator の結果を Research Artifact Sync へ渡す
- Idempotency & recovery（冪等性と回復）: 成功済み state がある場合 `--force` なしは拒否。rejected は同一 command artifact を history へ退避して再実行できる。

#### Research Artifact Sync

| 項目 | 詳細 |
|------|------|
| 意図 | TAKT run reports から deck-local research artifacts へ同期する |
| 要件 | 2.1, 2.3, 3.1, 4.1, 4.4 |

**責務と制約**

- `brief.md` は読み書きしない。
- sync 先は `slides/<deck>/research/` のみ。
- `research-report.md` は Research Source Report Locator が特定した built-in output から直接 copy する。
- `research-sources.md`、`research-claims.md`、`open-questions.md`、`research-supervision.md` は wrapper の top-level report output から copy する。
- artifact replace は既存 `replaceFileAtomically` を使う。
- `research --force` の archive 先は `slides/<deck>/research/history/` のみ。

### TAKT workflow

#### Research Workflow Wrapper

| 項目 | 詳細 |
|------|------|
| 意図 | TAKT built-in `deep-research` を slide workflow の artifact contract に接続する |
| 要件 | 1.2, 3.1, 6.1, 6.5 |

**責務と制約**

- `kind: workflow_call` と `call: deep-research` を使い、調査実行そのものは TAKT built-in に委譲する。
- repo-local wrapper は `deep_research` workflow_call step、adapter step、supervision step だけを定義する。
- `deep_research` step は Runner が渡した TAKT target `slides/<deck>/research/research-brief.md` をそのまま built-in workflow へ渡す。
- adapter と supervision は `.takt/workflow-current-target.json` を読み、state/report front matter の `target` には user-facing target `slides/<deck>` を書く。
- web access の許可は built-in research workflow 内に閉じる。
- built-in facets の persona/policy/output contract を repo-local にコピーしない。

**契約種別**: Batch [x]

#### Research Adapter

| 項目 | 詳細 |
|------|------|
| 意図 | built-in `research-report.md` を requirements が求める deck-local artifacts に写像する |
| 要件 | 3.2, 3.3, 3.4, 3.5, 6.3 |

**責務と制約**

- 入力は built-in `research-report.md` のみとする。
- `research-sources.md` は built-in report のデータソース表と URL/取得日情報から、存在する情報だけを構造化する。
- `research-claims.md` は built-in report の主要な発見・結論を、built-in report 内で確認できる根拠 source と確度つきで構造化する。
- `open-questions.md` は built-in report の残存ギャップから作る。
- built-in report に URL、取得日、claim/source 対応、確度が明示されていない場合、adapter は `not_present_in_builtin_report` として記録し、推測で補完しない。
- 追加調査、外部 web fetch、出典の再評価、独自 research policy の適用、built-in report にない claim 生成は行わない。
- adapter は情報欠落だけを理由に失敗しない。失敗条件は source report が読めない、handoff marker または adapter output front matter が壊れている、または output file を生成できない場合に限定する。

**契約種別**: Batch [x]

### Workflow facets

#### Plan Optional Context

| 項目 | 詳細 |
|------|------|
| 意図 | research artifacts を `plan` の任意入力として扱う |
| 要件 | 2.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.2 |

**責務と制約**

- `brief.md` を primary input として維持する。
- research artifacts が存在する場合のみ参照する。
- `open-questions.md` の内容は未解決前提として扱い、推測で埋めない。
- `reference-analysis.md` または `plan.md` に research 由来の根拠を識別できる記述を残す。
- external web access は success condition にしない。

**契約種別**: Batch [x]

### Distribution and validation

#### Template Distribution

| 項目 | 詳細 |
|------|------|
| 意図 | bundled/ejected 両方で research workflow を利用可能にする |
| 要件 | 7.1, 7.2, 7.3, 7.6 |

**責務と制約**

- `.takt/workflows/takt-marp-slide-research.yaml` を template sync 対象にする。
- `templates/project/workflows/takt-marp-slide-research.yaml` は sync で生成する。
- ejected partial state は既存 resolver のエラー規約に従う。
- related facet は adapter instruction だけに限定し、built-in research facets はコピーしない。

#### Validation Surface

| 項目 | 詳細 |
|------|------|
| 意図 | research 追加で既存 workflow が壊れないことを機械的に確認する |
| 要件 | 7.4, 7.5 |

**責務と制約**

- foundation validation は command registry、research prerequisite、force archive、template path を検証する。
- smoke validation は mock research と既存 4 command の成功経路を検証する。
- `research --force` が review/approval を退避しないことを確認する。

## データモデル

Markdown 実体では YAML front matter と本文セクションを使う。front matter は既存 parser の scalar/inline-array subset に収め、nested object は使わない。

```typescript
interface ResearchArtifactManifest {
  command: "research";
  target: string;
  generated_at: string;
  workflow_run_id: string;
  source_report: "research-report.md";
  source_report_origin: "builtin_deep_research";
}

interface ResearchSourceEntry {
  source_id: string;
  title: string;
  url: string;
  retrieved_at: string;
  source_type: "web" | "document" | "codebase" | "other";
  confidence: "high" | "medium" | "low" | "not_present_in_builtin_report";
}

interface ResearchClaimEntry {
  claim_id: string;
  claim: string;
  confidence: "confirmed" | "inferred" | "uncertain" | "not_present_in_builtin_report";
  source_ids: string[];
  slide_use: string;
  caveats: string[];
}

interface OpenQuestionEntry {
  question_id: string;
  question: string;
  why_it_matters: string;
  suggested_next_step: string;
}
```

`research-report.md` は built-in output を正本とする。その他の research artifacts は正本ではなく、plan が参照しやすい index として扱う。adapter は built-in report に存在しない field を推測しないため、`url`、`retrieved_at`、`confidence`、`source_ids` などが report 内で確認できない場合は文字列 `not_present_in_builtin_report`、または空配列と caveat で欠落を表現する。

## エラーハンドリング

| 条件 | エラーコード | 挙動 |
|------|--------------|------|
| unsupported command | `INVALID_COMMAND` | 期待 command list に research を含めて表示 |
| missing target | `INVALID_TARGET` | 既存 target resolver の message を維持 |
| missing `research-brief.md` | `PREREQUISITE_MISSING` | TAKT 起動前に失敗 |
| missing research workflow template | `WORKFLOW_NOT_IMPLEMENTED` | workflow path を表示 |
| missing TAKT built-in `deep-research` | `BUILTIN_WORKFLOW_NOT_AVAILABLE` | built-in workflow name と期待 path を表示し、TAKT 起動前に失敗 |
| successful research rerun without force | `RERUN_BLOCKED` | `--force` を案内 |
| missing built-in `research-report.md` after TAKT success | `TAKT_SOURCE_ARTIFACT_SYNC_MISSING` | 不足 artifact 名を表示 |
| multiple built-in `research-report.md` candidates after TAKT success | `TAKT_SOURCE_ARTIFACT_SYNC_AMBIGUOUS` | 候補 path を表示し同期を拒否 |
| invalid research supervision state | `STATE_MISMATCH` | expected `researched` を表示 |
| missing adapter output artifact after TAKT success | `TAKT_SOURCE_ARTIFACT_SYNC_MISSING` | built-in report と不足 artifact を表示 |

## テスト戦略

### Foundation validation

- `requireCommand("research")` が通り、未知 command が拒否されることを確認する。1.1
- `research` config が `state: researched`、`artifactDomain: research`、`approvalSupported: false`、`invalidationTargets: ["research"]` を持つことを確認する。4.2, 4.5
- `plan` prerequisite が `research` を要求しないことを確認する。1.3, 5.3
- `research` prerequisite が `research-brief.md` を要求し、`brief.md` から推測しないことを確認する。2.1, 2.2
- `research` の TAKT target が user-facing target ではなく `slides/<deck>/research/research-brief.md` になることを確認する。2.1
- `.takt/workflow-current-target.json` が `target`、`research_brief_path`、`research_output_dir` を持ち、state target は `slides/<deck>` に残ることを確認する。1.1, 2.1, 4.2
- `assertBuiltinWorkflowAvailable("deep-research")` が built-in workflow 不在を TAKT 起動前に拒否することを確認する。1.2, 6.5
- `research --force` が `research/history/` だけへ archive し、`review/*-approval.md` を触らないことを確認する。4.4, 4.5
- bundled/ejected workflow path が `takt-marp-slide-research.yaml` を解決することを確認する。7.1, 7.2
- research wrapper が `call: deep-research` を使い、built-in research facets を repo-local に複製していないことを確認する。6.5
- source report locator が `reports/subworkflows/**/research-report.md` から `workflow-deep-research` の report を一意に選ぶことを確認する。3.1
- source report locator が 0 件と複数件をそれぞれ `TAKT_SOURCE_ARTIFACT_SYNC_MISSING` / `TAKT_SOURCE_ARTIFACT_SYNC_AMBIGUOUS` で拒否することを確認する。3.1

### Smoke validation

- mock provider で `research` が `research-supervision.md` と research artifacts を `slides/<deck>/research/` に同期することを確認する。3.1-4.1
- mock provider の built-in `research-report.md` が byte-for-byte で `slides/<deck>/research/research-report.md` に同期され、adapter 出力で置換されないことを確認する。3.1, 6.5
- mock provider の report に URL/取得日/claim-source 対応が欠ける場合、adapter が `not_present_in_builtin_report` を出し、追加調査や補完を行わないことを確認する。3.2-3.5, 6.5
- research 未実行 deck で `plan` が成功することを確認する。5.1, 5.3
- research 実行済み deck で `plan` が research artifacts を任意文脈として参照し、research 由来を `reference-analysis.md` に残すことを確認する。5.2, 5.4
- 既存 `plan / compose / polish / deliver` smoke が research 追加後も成功することを確認する。7.5

### Template validation

- `.takt/workflows/takt-marp-slide-research.yaml` と `templates/project/workflows/takt-marp-slide-research.yaml` の drift を検出する。7.6
- ejected templates に research wrapper と adapter instruction が含まれることを確認する。7.3
- built-in research facets が `templates/project/facets/**` にコピーされていないことを確認する。6.5

## セキュリティとプライバシー

- `research` は built-in deep research により外部 web access を許可しうるため、入力に秘密情報を入れないことを `research-brief` docs と adapter instruction に明記する。
- `plan / compose / polish / deliver` は外部 web access を成功条件にしない。
- research artifacts は deck-local Markdown として保存されるため、出典 URL と取得日を残しつつ、API keys や private credentials を含めない。
- TAKT 実行は既存どおり `--skip-git` を維持し、agent に git 操作を委譲しない。

## 移行

既存 deck は変更不要である。`research` を使う deck だけ `slides/<deck>/research/research-brief.md` を追加する。

実装順:

1. command registry と runner の domain 分離を入れ、既存 4 command の挙動を維持する。
2. research wrapper を `.takt` に追加し、`call: deep-research` で built-in を呼ぶ。
3. built-in report adapter と runner sync を research domain に対応させる。
4. plan optional context を workflow/facets に追加する。
5. template sync と validation/smoke を追加する。
6. docs を更新する。
