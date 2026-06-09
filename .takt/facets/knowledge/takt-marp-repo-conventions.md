# Marpリポジトリ規約

このリポジトリは Marp プレゼンテーションを `slides/` 配下で管理する。

## 基本構成

各 deck は `slides/<deck>/` に置く。

```text
slides/<deck>/
  brief.md
  brief.normalized.md
  plan.md
  design-system.md
  SLIDES.md
  images/
  review/
```

## Marp

`SLIDES.md` は Marp Markdown である。
front matter には少なくとも `marp: true`、`theme`、`paginate` を含める。

既存 deck は日本語 speaker notes を HTML コメントで持つ。

```md
<!--
このスライドで話す補足を書く。
-->
```

## Design System

各deckは `design-system.md` を持つ。
`design-system.md` は typography、spacing、layout、visual、color、QA rules のdeck-local tokenを定義する。
`SLIDES.md` のfront matter CSSは、スライドごとの個別調整ではなく、design-system tokenと用途別classで構成する。

## Visual

SVG は `slides/<deck>/images/*.svg` に保存し、Marp から相対パスで参照する。

```md
<!-- _class: visual -->

![](images/example.svg)
```

図入りスライドのSVGサイズは、個別の `![h:...]` や `![w:...]` ではなく、`visual` / `visual-dense` / `visual-full` などのMarp class側CSSで制御する。

`marp.config.mjs` は Kroki を SVG 出力で使う。
構造図やフロー図は SVG としてレビュー可能な形を優先する。

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
