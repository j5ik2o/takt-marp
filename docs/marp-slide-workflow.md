# Marp Slide Workflow

このドキュメントは、Marp スライド生成用 TAKT workflow の source of truth である。
`.takt/workflows/*.yaml` と `.takt/facets/**/*.md` は、この契約に従う。
Report schema は [marp-slide-workflow-reports.md](marp-slide-workflow-reports.md) に定義する。

## 目的

Marp スライドを、入力整理、構成、本文、SVG 図解、render polish、delivery まで一貫した工程で生成する。
完全自動ではなく、`plan` 後と `compose` 後に人間 approval を挟む半自動 workflow とする。

## ディレクトリ構成

```text
slides/<deck>/
  brief.md
  brief.normalized.md
  reference-analysis.md
  plan.md
  slide-blueprint.md
  design/
    <claude-design-export>.zip
  sections/
    manifest.md
    *.md
  SLIDES.md
  images/
    *.svg
  research/
    research-brief.md
    research-report.md
    research-sources.md
    research-claims.md
    open-questions.md
    research-supervision.md
  review/
    plan-supervision.md
    plan-approval.md
    compose-supervision.md
    compose-approval.md
    polish-supervision.md
    deliver-supervision.md
```

```text
.takt/design-contracts/<deck>/
  resolved-design-contract.json
```

## 入力契約

workflow target は常に `slides/<deck>` とする。`slides/<deck>/brief.md` を人間入力の正とするが、CLI target として `brief.md` を直接渡してはいけない。
`brief.md` が存在しない場合、plan workflow はテンプレートを作成して停止する。
`plan` 後と `compose` 後の human approval 待ちは workflow の失敗として扱わない。
`plan` と `compose` は `slides/<deck>/design/` に `_ds_manifest.json` を含む Claude Design export zip が1つあることを前提にする。`design-system.md`、手書き `design-contract.md`、package default は代替入力にしない。

必須項目:

- `Goal`
- `Core Message`
- `Audience Context`
- `Output Requirements`

任意項目:

- `Event`
- `Speaker Profile`
- `Fact Inventory`
- `Required Topics`
- `Optional Topics`
- `Avoid`
- `Source Materials`
- `Speaker Notes`

`Source Materials` のローカルファイルは読んでよい。URL は自動取得しない。必要な内容は `brief.md` に貼るか、取得許可を `plan-supervision.md` で求める。

## research 入力契約

`research` は任意の前段 command であり、`plan` の必須前提ではない。外部調査が必要な deck だけ、CLI help と同じ command surface で実行する。

```bash
takt-marp research slides/<deck>
```

入力は `slides/<deck>/research/research-brief.md` とする。`research` は `brief.md` から調査依頼を暗黙推測しないため、`research-brief.md` がない場合は明示エラーで停止する。`plan` は `brief.md` を primary input として扱い続け、`research-brief.md` や research artifacts の有無だけでは失敗しない。

`research` は TAKT built-in `deep-research` を呼び、built-in が出力した `research-report.md` を正本とする。repo-local workflow は deep research 本体を fork せず、wrapper、adapter、supervision だけを所有する。

外部 web access は `research` command と built-in `deep-research` の境界に閉じる。`plan`、`compose`、`polish`、`deliver` は外部 web 取得を成功条件にしない。

## brief.md テンプレート

```md
# Brief

## Event
- Name:
- Date:
- Duration:
- Venue:
- Audience:

## Speaker Profile
- Name:
- Title:
- Highlights:

## Fact Inventory
<!-- 根拠付き事実(version、数値実績等)をここに列挙する -->

## Goal

## Core Message

## Audience Context

## Required Topics

## Optional Topics

## Avoid

## Source Materials

## Speaker Notes

## Output Requirements
- Format: Marp
- Language: Japanese
- Target slide count:
- Deliverables: html, pdf
```

## plan.md 契約

`plan.md` はスライド設計図である。スライド一覧だけでなく、各スライドの `Message`、`Layout`、`Content`、`Visual`、`Speaker note intent`、`Source` を含める。
後続の `deliver` は `plan.md` 内の単一行 `deliverables: [html, pdf]` を authoritative delivery request として読む。

`slides/<deck>/research/` に `research-report.md`、`research-claims.md`、`open-questions.md` が存在する場合、`plan` はそれらを任意の追加文脈として読める。research artifacts を使った場合は `reference-analysis.md` または `plan.md` に research 由来根拠を識別できる形で残し、未解決事項は前提または保留として扱う。research artifacts が存在しない場合、`plan` は research 不在を通常状態として扱う。

`Layout` は `.takt/facets/knowledge/takt-marp-repo-conventions.md` の「Layout 語彙」表にある基本語彙のいずれかを選ぶ。基本語彙で表現できない場合のみ `custom:` 拡張句を使用する。

**基本 class(12 種)**

| class | 用途 |
|---|---|
| `title` | デッキ表紙・章扉 |
| `single` | 本文 1 列のスタンダードスライド |
| `visual` | 図版主体(テキスト少) |
| `visual-dense` | 図版 + 解説テキスト併置 |
| `visual-full` | 図版全画面(テキストなし〜最小) |
| `split-50-50` | 左右均等 2 分割 |
| `split-45-55` | 左右非対称 2 分割(45:55) |
| `split-40-60` | 左右非対称 2 分割(40:60) |
| `split-60-40` | 左右非対称 2 分割(60:40) |
| `compare-2col` | 2 項目の比較・対比 |
| `infographic` | カードグリッドによる情報整理 |
| `code-2col` | コードと解説を横並び |

**modifier(単独使用不可 — 必ず基本 class と組み合わせる)**

| class | 用途 | 適用先 |
|---|---|---|
| `profile` | 登壇者プロフィール(右に写真、左に名前と実績) | `single` |
| `layers` | グリッドを中央寄せにする重ね図向け調整 | `infographic` |
| `dual` | バッジ重畳など 2 要素の重ね合わせ | `visual-full` 等 |
| `tag-takt` | コンテキストタグ: TAKT デッキ識別 | 任意の基本 class |
| `tag-sdd` | コンテキストタグ: SDD デッキ識別 | 任意の基本 class |
| `tag-ccsdd` | コンテキストタグ: CC-SDD デッキ識別 | 任意の基本 class |
| `tag-*` | コンテキストタグ(任意の識別子) | 任意の基本 class |

**custom 拡張句**

基本語彙で表現できない場合のみ、`custom: <kebab-case-class> — <用途1行>` の形式で指定する。後続の compose は Resolved Design Contract の token constraints に従って同名 class を実装する。

```md
# Slide Plan

## Deck Summary
- Title:
- Audience:
- Duration:
- Core message:
- Narrative arc:
- deliverables: [html, pdf]

## Sections

## Slides

### 1. Title
- Message:
- Layout:
- Content:
- Visual:
- Speaker note intent:
- Source:
```

## Design Contract 契約

Claude Design Source は `slides/<deck>/design/` に置く Claude Design export zip である。
Runner は `plan` / `compose` の開始前に Claude Design Source を読み、`.takt/design-contracts/<deck>/resolved-design-contract.json` へ正規化する。
`plan.md` と `slide-blueprint.md` は source path、namespace、fingerprint、token summary、adherence availability、`guidance`、`source_catalog` を記録するが、CSS、front matter style、`_class` style 定義は生成しない。
`SLIDES.md` のfront matter CSSは Resolved Design Contract の token をもとに構成し、スライドごとの個別調整を避ける。
Design System は deck ごとに異なる。`SKILL.md`、`readme.md`、component prompt、card、sample slide、template、asset は Resolved Design Contract の generic catalog として参照し、特定ドメインや特定 component 名を workflow に固定しない。

必須項目:

- `_ds_manifest.json`
- `styles.css`
- `tokens/colors.css`
- `tokens/typography.css`
- `tokens/spacing.css`

任意項目:

- `_adherence.oxlintrc.json`
- `tokens/fonts.css`
- `_ds_bundle.js`
- `.thumbnail`
- `SKILL.md`
- `readme.md` / `README.md`
- `components/**/*.prompt.md`
- `guidelines/*.card.html`
- `slides/*.html`
- `templates/**/*.dc.html`
- `assets/*`

## Workflow 一覧

```text
.takt/workflows/
  takt-marp-slide-research.yaml
  takt-marp-slide-plan.yaml
  takt-marp-slide-compose.yaml
  takt-marp-slide-polish.yaml
  takt-marp-slide-deliver.yaml
```

各workflowのfix/review反復は、通常stepではなくTAKT workflow直下の `loop_monitors` で監視する。`*-loop-monitor.md` のようなdeck-local reportは生成しない。

### takt-marp-slide-research

`slides/<deck>/research/research-brief.md` を入力に、任意の事前調査を実行する。`research` は `plan` の前に実行できるが、`plan` の必須前提ではない。

Steps:

1. `deep_research` (`workflow_call` で TAKT built-in `deep-research` を呼ぶ)
2. `adapt_research`
3. `supervise_research`

成果物:

- `slides/<deck>/research/research-report.md` は built-in `deep-research` の `research-report.md` を byte-for-byte copy した正本
- `slides/<deck>/research/research-sources.md`
- `slides/<deck>/research/research-claims.md`
- `slides/<deck>/research/open-questions.md`
- `slides/<deck>/research/research-supervision.md`

Runner は current TAKT run の selected parent reports directory の内側だけから built-in `research-report.md` を探索し、`workflow-deep-research` subworkflow の report を優先する。adapter output で `research-report.md` を置き換えてはいけない。

成功済みの `research` は `--force` なしで再実行できない。`research --force` は既存 research artifacts を `slides/<deck>/research/history/` に退避するが、`review/` 配下の `plan / compose / polish / deliver` reports や approval files は退避しない。`research` が rejected の場合は、rejected artifact を同じ research domain の history に退避して再実行できる。

### takt-marp-slide-plan

`slides/<deck>` を検証し、後段用の `brief.normalized.md` と `plan.md` を生成する。research artifacts がある場合は任意文脈として参照できるが、外部 web access や research 成功状態を `plan` の成功条件にしない。

Steps:

1. `intake`
2. `normalize_brief`
3. `plan_deck`
4. `summarize_plan_work`
5. `review_plan`
6. `fix_plan`
7. `supervise_plan`

成果物:

- `slides/<deck>/brief.md` 未作成時はテンプレート
- `slides/<deck>/brief.normalized.md`
- `slides/<deck>/plan.md`
- `slides/<deck>/review/plan-work.md`
- `slides/<deck>/review/plan-review.md`
- `slides/<deck>/review/plan-fix.md`
- `slides/<deck>/review/plan-supervision.md`
- `slides/<deck>/review/plan-approval.md` は人間承認コマンドでのみ生成する

### takt-marp-slide-compose

承認済みの `plan.md` と Resolved Design Contract から、section source、`SLIDES.md`、必要な visual source を生成する。

Steps:

1. `compose_sections`
2. `assemble_slides`
3. `generate_visuals`
4. `summarize_compose_work`
5. `ai_quality_gate_compose`
6. `review_compose`
7. `fix_compose`
8. `supervise_compose`

成果物:

- `slides/<deck>/SLIDES.md`
- `slides/<deck>/sections/manifest.md`
- `slides/<deck>/sections/*.md`
- `slides/<deck>/images/*.svg`
- `slides/<deck>/review/compose-work.md`
- `slides/<deck>/review/compose-review.md`
- `slides/<deck>/review/compose-fix.md`
- `slides/<deck>/review/compose-supervision.md`
- `slides/<deck>/review/compose-approval.md` は人間承認コマンドでのみ生成する

### takt-marp-slide-polish

承認済みの compose 成果物を対象に、render evidence、inspection、修正、最終 supervision を command 内部で完結させる。

Steps:

1. `render_evidence`
2. `inspect_render`
3. `fix_polish`
4. `supervise_polish`

成果物:

- `.takt/render/<deck>/cycle-1/metadata.json`
- `slides/<deck>/review/polish-work.md`
- `slides/<deck>/review/polish-inspect.md`
- `slides/<deck>/review/polish-fix.md`
- `slides/<deck>/review/polish-supervision.md`
- 必要に応じて `SLIDES.md` と `images/*.svg` の修正

### takt-marp-slide-deliver

Marp HTML/PDF/PPTX 生成、delivery verification、delivery-only fix、最終 supervision を command 内部で完結させる。
`plan.md` の `deliverables` に `pdf` がある場合は `dist/<deck>/SLIDES.pdf` を生成・検証する。

単純なローカル生成や preview は `takt-marp build:html`、`takt-marp build:pdf`、`takt-marp build:pptx`、`takt-marp preview` を使う。
これらは TAKT workflow を起動せず、workflow state、review report、approval file を変更しない utility command とする。

Steps:

1. `build_delivery`
2. `verify_delivery`
3. `fix_delivery`
4. `supervise_delivery`

成果物:

- `dist/<deck>/SLIDES.html`
- `plan.md` の `deliverables` に `pdf` がある場合は `dist/<deck>/SLIDES.pdf`
- `plan.md` の `deliverables` に `pptx` がある場合は `dist/<deck>/SLIDES.pptx`
- `slides/<deck>/review/deliver-work.md`
- `slides/<deck>/review/deliver-verify.md`
- `slides/<deck>/review/deliver-fix.md`
- `slides/<deck>/review/deliver-supervision.md`

## Visual 方針

SVG-first とする。SVG は原則 `slides/<deck>/images/*.svg` として保存し、`SLIDES.md` から参照する(外部ファイルが既定)。スライド固有で deck の CSS 変数・class と一体で制御する図版は、`takt-marp-svg-first-visual` policy の使い分け基準に従い inline SVG も利用できる(front matter `html: true` が前提)。

優先順位:

1. 手書き/生成 SVG
2. Kroki/Mermaid/PlantUML 等からの SVG
3. ラスター画像生成

SVG 共通制約:

- `viewBox` は原則 `0 0 1100 540`
- font は `Noto Sans JP`, `Hiragino Sans`, `Yu Gothic`, `sans-serif`(knowledge の日本語優先フォールバックスタックと同順)
- 1 SVG = 1 message
- 本文テキストを詰め込まない
- 外周余白は 40-60px
- 色は強調色 1-2 色まで
- 影や装飾は最小限
- Marp 上で幅 900-1080px でも読める

## 既存画像

既存画像は `brief.md` または `plan.md` に明記されたものだけ使う。
他 deck の画像や Web 画像を自動流用しない。

## Speaker Notes

各スライドに speaker notes を付ける。
本文の読み上げではなく、話者の補足、つなぎ、強調点を書く。

```md
<!--
このスライドで話すことを2-5文で書く。
-->
```

## 情報密度

- 1 スライド 1 メッセージ
- 本文は最大 5 bullets
- 1 bullet は原則 1 行
- 表は最大 5 行 x 4 列を目安にする
- コードは短い抜粋のみ
- 詳細は speaker notes または appendix に逃がす

Appendix は必要な場合だけ生成し、本編と明確に分離する。

## レビュー観点

- `concept`: 主張が明確か、聴衆に刺さるか、core message から逸れていないか
- `flow`: 導入から結論まで自然か、飛躍がないか、尺に対して密度が適切か
- `visual`: SVG が主張を支えているか、文字量、色、余白、可読性、スライド枠からのはみ出しに問題がないか
- `assertion`: 事実主張に根拠があるか、誇張や断定がないか、source と矛盾しないか

## QA 合格条件

必須:

- `takt-marp build:html <deck>` が成功する
- `SLIDES.md` から参照される `images/*.svg` が存在する
- SVG が XML として壊れていない
- `dist/` に HTML が生成される
- `Deliverables` に `pdf` がある場合、MarpでPDF生成でき、生成されたPDFが読める
- 図入りスライドで文字・図形・矢印・ページ番号がスライド枠からはみ出していない

任意:

- `Deliverables` に `pptx` がある場合は外部生成済みPPTXが存在する
- PNG生成またはブラウザによる代表スライドの目視確認

## Smoke fixture

通常の `takt-marp build:*` と `npm run build` は target 省略時に `slides/` 配下の Markdown を変換対象にする。
そのため smoke 用の入力は `slides/` 外に置き、実行確認時だけ `slides/_workflow-smoke/` にコピーする。

```text
fixtures/marp-slide-workflow/_workflow-smoke/
  brief.md
  README.md
```

Smoke 実行前:

```bash
mkdir -p slides/_workflow-smoke
cp fixtures/marp-slide-workflow/_workflow-smoke/brief.md slides/_workflow-smoke/brief.md
```

## 運用コマンド

```bash
npm run slide:research -- "slides/<deck>"
npm run slide:plan -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" plan --by "<name>"
npm run slide:compose -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" compose --by "<name>"
npm run slide:polish -- "slides/<deck>"
npm run slide:deliver -- "slides/<deck>"
```

`research` は必要な場合だけ実行する。global CLI では `takt-marp research slides/<deck>` が同じ workflow を起動する。

`plan` と `compose` の後に、人間が生成物を確認し、必要なら `brief.md`、`plan.md`、Claude Design Source、`SLIDES.md`、SVG を編集してから承認コマンドを実行する。
