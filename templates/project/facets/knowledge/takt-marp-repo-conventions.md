# Marpリポジトリ規約

このリポジトリは Marp プレゼンテーションを `slides/` 配下で管理する。

## 基本構成

各 deck は `slides/<deck>/` に置く。

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
  review/
```

## Marp

`SLIDES.md` は Marp Markdown である。
front matter には少なくとも `marp: true`、`theme`、`paginate` を含める。
`SLIDES.md` 本文に HTML 要素(inline SVG 含む)を使う場合は、front matter に `html: true` を設定する。

既存 deck は日本語 speaker notes を HTML コメントで持つ。

```md
<!--
このスライドで話す補足を書く。
-->
```

## Font

font style には日本語優先フォールバックスタックを必ず指定する。
推奨スタック: `"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif`
`@font-face` を宣言する場合は、`SLIDES.md` からの相対 path が実在するファイルのみを参照する(path が存在しない環境では `@font-face` を省略し、フォールバックスタックのみで描画する)。

## Design Contract

各deckは `slides/<deck>/design/` に Claude Design Source の zip を1つ置く。
workflow runner は Claude Design Source を `.takt/design-contracts/<deck>/resolved-design-contract.json` へ正規化し、`.takt/workflow-current-target.json` の `design_contract` で plan / compose へ渡す。
Claude Design Source の内容は deck ごとに異なる。Resolved Design Contract の `guidance` と `source_catalog` に含まれる `SKILL.md`、`readme.md`、component prompts、cards、sample slides、templates、assets をその deck 固有の入力として扱い、特定ドメインや特定 component 名を workflow 側に固定してはならない。
`plan.md` と `slide-blueprint.md` は Design Contract metadata と fingerprint を記録するが、CSS、front matter style、`_class` style 定義は生成しない。
`SLIDES.md` のfront matter CSSは、スライドごとの個別調整ではなく、Resolved Design Contract の token と用途別classで構成する。
既存 deck に `design-system.md` が残っていても、Claude Design Source、override、compose 成功条件として扱わない。

## Section Source

講義本体のような長いdeckでは、`slide-blueprint.md` から `sections/manifest.md` と `sections/*.md` を作り、最後に `SLIDES.md` へassembleする。
`sections/*.md` はfront matterを持たず、各slideに `<!-- slide_id: SNNN -->` を含める。
`SLIDES.md` はfront matter、global style、sectionの連結結果を持つassembled source artifactとして扱う。

## Visual

カード、比較、表、軽量フロー、タイムライン、コード注釈は、まず `SLIDES.md` 内のHTML/CSSで構成する。
HTML visualを使う場合は front matter に `html: true` を設定する。

```md
<!-- _class: visual -->

<div class="visual-grid">
  <div class="visual-card">...</div>
  <div class="visual-card">...</div>
</div>
```

座標制御、複雑な矢印、再利用、単体差分レビューが必要な図だけSVGにする。
外部SVGは `slides/<deck>/images/*.svg` に保存し、Marp から相対パスで参照する。

```md
<!-- _class: visual -->

![](images/example.svg)
```

図入りスライドのvisualサイズは、個別の `![h:...]` や `![w:...]` ではなく、`visual` / `visual-dense` / `visual-full` などのMarp class側CSSで制御する。

## Layout 語彙

以下は基本語彙であり、拡張可能な出発点である(閉じた enum ではない)。
plan / compose は `_class:` にこの語彙を使用するか、命名規約に従い新 class を定義する。新 class の実装は Resolved Design Contract の token constraints に従う。

### 基本 class

| class | 区分 | 用途 | 構造ヒント |
|---|---|---|---|
| title | 基本 | デッキ表紙・章扉 | 大見出しのみ、サブタイトル任意 |
| single | 基本 | 本文 1 列のスタンダードスライド | 見出し + 本文エリア |
| visual | 基本 | 図版主体(テキスト少) | 画像を中央大表示 |
| visual-dense | 基本 | 図版 + 解説テキスト併置 | 図版と箇条書きを縦積み |
| visual-full | 基本 | 図版全画面(テキストなし〜最小) | 画像がスライド全域を占有 |
| split-50-50 | 基本 | 左右均等 2 分割 | 左右各 50% |
| split-45-55 | 基本 | 左右非対称 2 分割(45:55) | 左 45% / 右 55% |
| split-40-60 | 基本 | 左右非対称 2 分割(40:60) | 左 40% / 右 60% |
| split-60-40 | 基本 | 左右非対称 2 分割(60:40) | 左 60% / 右 40% |
| compare-2col | 基本 | 2 項目の比較・対比 | 左右に比較対象を並置 |
| infographic | 基本 | カードグリッドによる情報整理 | `.ig-grid` / `.ig-card` を使う |
| code-2col | 基本 | コードと解説を横並び | 左: コードブロック、右: 解説 |

### modifier(単独使用不可)

modifier は必ず基本 class と組み合わせて使用する。単独使用は不可。

| class | 区分 | 用途 | 適用先 base class |
|---|---|---|---|
| profile | modifier | 登壇者プロフィール(右に写真、左に名前と実績) | single |
| layers | modifier | グリッドを中央寄せにする重ね図向け調整 | infographic |
| dual | modifier | バッジ重畳など 2 要素の重ね合わせ | visual-full 等 |
| tag-takt | modifier | コンテキストタグ: TAKT デッキ識別 | 任意の基本 class |
| tag-sdd | modifier | コンテキストタグ: SDD デッキ識別 | 任意の基本 class |
| tag-ccsdd | modifier | コンテキストタグ: CC-SDD デッキ識別 | 任意の基本 class |
| tag-* | modifier | コンテキストタグ(任意の識別子) | 任意の基本 class |

## Build

`package.json` の標準 script:

```bash
npm run preview:all
npm run build
npm run build:html -- <deck>
npm run build:pdf -- <deck>
npm run build:pptx -- <deck>
```

標準成果物は HTML と PDF である。PPTX は `brief.md` の `Deliverables` に `pptx` がある場合だけ生成する。

当日プレゼンのpreviewは `marp -s slides/` で確認する。
TAKT worker 内の build QA では、preview serverを短時間起動し、`http://localhost:8080/<deck>/SLIDES.md` が開けることを確認する。

TAKT worker 内の build QA では、`Deliverables` に `pdf` がある場合は `npm run build:pdf -- <deck>` で `slides/<deck>/SLIDES.md` だけをPDF生成する。
PPTXは `brief.md` の `Deliverables` に `pptx` がある場合だけ対象にする。

## 入力の扱い

`brief.md` が人間入力の正である。
`brief.normalized.md` は TAKT が後段 workflow のために整理した作業用入力であり、意図を変更する場合は `brief.md` を更新して plan を再生成する。
