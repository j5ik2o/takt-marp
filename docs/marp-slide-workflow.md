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
  plan.md
  design-system.md
  SLIDES.md
  images/
    *.svg
  review/
    plan-supervision.md
    plan-approval.md
    compose-supervision.md
    compose-approval.md
    polish-supervision.md
    deliver-supervision.md
```

## 入力契約

workflow target は常に `slides/<deck>` とする。`slides/<deck>/brief.md` を人間入力の正とするが、CLI target として `brief.md` を直接渡してはいけない。
`brief.md` が存在しない場合、plan workflow はテンプレートを作成して停止する。
`plan` 後と `compose` 後の human approval 待ちは workflow の失敗として扱わない。

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

基本語彙で表現できない場合のみ、`custom: <kebab-case-class> — <用途1行>` の形式で指定する。後続の design-system step が同名 class を定義する。

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

## design-system.md 契約

`design-system.md` はdeck-localな軽量デザインシステムである。
`SLIDES.md` のfront matter CSSはこのtokenをもとに構成し、スライドごとの個別調整を避ける。

必須項目:

- Typography tokens
- Spacing tokens
- Layout classes
- Visual tokens
- Color tokens
- QA rules

## Workflow 一覧

```text
.takt/workflows/
  takt-marp-slide-plan.yaml
  takt-marp-slide-compose.yaml
  takt-marp-slide-polish.yaml
  takt-marp-slide-deliver.yaml
```

各workflowのfix/review反復は、通常stepではなくTAKT workflow直下の `loop_monitors` で監視する。`*-loop-monitor.md` のようなdeck-local reportは生成しない。

### takt-marp-slide-plan

`slides/<deck>` を検証し、後段用の `brief.normalized.md` と `plan.md` を生成する。

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

承認済みの `plan.md` から `design-system.md`、`SLIDES.md`、SVG 初稿を生成する。

Steps:

1. `design_system`
2. `compose_slides`
3. `generate_visuals`
4. `summarize_compose_work`
5. `review_compose`
6. `fix_compose`
7. `supervise_compose`

成果物:

- `slides/<deck>/SLIDES.md`
- `slides/<deck>/design-system.md`
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
- font は `Noto Sans JP`, `Hiragino Sans`, `sans-serif`
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

- `npm run build:html -- <deck>` が成功する
- `SLIDES.md` から参照される `images/*.svg` が存在する
- SVG が XML として壊れていない
- `dist/` に HTML が生成される
- `Deliverables` に `pdf` がある場合、MarpでPDF生成でき、生成されたPDFが読める
- 図入りスライドで文字・図形・矢印・ページ番号がスライド枠からはみ出していない

任意:

- `Deliverables` に `pptx` がある場合は外部生成済みPPTXが存在する
- PNG生成またはブラウザによる代表スライドの目視確認

## Smoke fixture

通常の `npm run build` は `slides/` 配下の Markdown を変換対象にする。
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
npm run slide:plan -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" plan --by "<name>"
npm run slide:compose -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" compose --by "<name>"
npm run slide:polish -- "slides/<deck>"
npm run slide:deliver -- "slides/<deck>"
```

`plan` と `compose` の後に、人間が生成物を確認し、必要なら `brief.md`、`plan.md`、`SLIDES.md`、SVG を編集してから承認コマンドを実行する。
