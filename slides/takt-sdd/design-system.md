# Design System — takt-sdd

このファイルは `slides/takt-sdd` deck の軽量デザインシステムである。
`SLIDES.md` の front matter CSS は、スライドごとの個別調整ではなく、ここで定義する
**CSS変数（token）** と **用途別class** を転記して構成する。

- 対象 deck: `TAKTでAI開発を制御する`（9スライド / 28分 / Online）
- theme 前提: Marp 標準 `default` theme を base にし、本 token で上書きする
- 使用レイアウト（plan準拠）: `title`(=スライド1 single) / `single` / `visual-full` / `compare-2col`
- 定義する class / token は本deckで実際に使う4レイアウト分に限定する（未使用の投機的レイアウトは持たない）

---

## 1. Typography tokens

| token | 値 | 用途 |
|-------|----|----|
| `--font-sans` | `"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif` | 本文・見出しの基本font family |
| `--font-mono` | `"SFMono-Regular", "Menlo", "Consolas", monospace` | command / workflow / facet 名のcode |
| `--ls-base` | `0.01em` | 本文の字間（**負値は禁止**） |
| `--lh-tight` | `1.25` | H1・lead の line-height |
| `--lh-body` | `1.65` | bullet・本文の line-height |
| `--fs-h1` | `40px` | H1（各スライド見出し） |
| `--fs-title` | `54px` | title スライドのメインタイトル |
| `--fs-subtitle` | `26px` | title スライドのサブタイトル |
| `--fs-lead` | `24px` | 各スライド冒頭の1行リード（Message） |
| `--fs-bullet` | `22px` | bullet 本文 |
| `--fs-caption` | `18px` | visual スライドの図キャプション |
| `--fs-code-label` | `19px` | command / facet ラベルのinline code |
| `--fs-svgtext` | `20px` | SVG内テキストの基準サイズ（viewBox 1100x540基準） |

ルール:
- font-weight は H1/title=700、lead=600、bullet=400 の3段のみ。任意の数値weightを増やさない。
- letter-spacing は `--ls-base` 固定。スライド個別に詰めない。

---

## 2. Spacing tokens

| token | 値 | 用途 |
|-------|----|----|
| `--pad-section` | `48px 64px` | スライド外周padding（上下 左右） |
| `--pad-visual-full` | `36px 64px` | `visual-full` 専用padding（図の表示面積を優先） |
| `--gap-col` | `40px` | 2列レイアウトの列間gap |
| `--gap-list` | `14px` | bullet間の縦gap |
| `--gap-lead` | `28px` | lead と本文ブロックの間 |
| `--gap-visual-title` | `16px` | `visual-full` のH1とSVGの間 |
| `--mar-img` | `16px` | 画像/SVGの外周margin |
| `--pad-card` | `24px 28px` | compare列カードの内側padding |

ルール:
- 縦詰めは `--gap-list` で統一し、bulletごとに `margin` を直書きしない。
- 過度な上寄り/左寄りを避けるため、`single`/`compare` は縦方向 `center` を既定にする（§4）。

---

## 3. Layout tokens & classes

列構成・比率・整列・画像最大高を token 化する。`SLIDES.md` では `<!-- _class: ... -->` で適用する。

| token | 値 | 用途 |
|-------|----|----|
| `--ratio-50-50` | `1fr 1fr` | 左右対等（`compare-2col`） |
| `--align-cross` | `center` | 列の交差軸整列（align-items） |
| `--img-h-full` | `62vh` | `visual-full` の画像最大高（H1・短いcaption と同居させる） |

### Layout class の使い分け（plan `Layout` 対応）

| class | 構成 | 使う場面 | 本deckでの使用 |
|-------|------|---------|--------------|
| `title` | 1列・中央寄せ・大見出し | 導入。タイトル＋サブタイトル＋主張 | スライド1 |
| `single` | 1列（base `section`・flex縦centering） | 構造化リスト・結論列挙。比較も図も不要 | スライド3,5,7,9 |
| `visual-full` | 1列・図最大化（`--img-h-full`）・本文はキャプションのみ | 山場の地図/構造図を渡す | スライド2,4,8 |
| `compare-2col` | 2列 `--ratio-50-50`・各列カード（`--pad-card`） | 左右対比（生成 vs 検証 等） | スライド6 |

ルール:
- 列比率は token から選ぶ。`grid-template-columns` に生の比率を直書きしない。
- `compare-2col` の align-items は `--align-cross`（center）を既定にする。
- `title` は中央寄せだが、補足bullet（`ul`）はブロック中央・テキスト左揃え（`section.title ul { text-align: left }`）とし、marker と本文が分離しないようにする。個別 inline style では当てない。

---

## 4. Visual tokens（SVG）

`images/*.svg` は `marp.config.mjs`（Kroki SVG出力）と相対パス参照を前提にする。

| token | 値 | 用途 |
|-------|----|----|
| `--svg-viewbox` | `0 0 1100 540` | 全SVG共通のviewBox |
| `--svg-pad-outer` | `24` | viewBox外周の余白（端に図形を寄せない） |
| `--svg-pad-shape` | `12` | 図形内テキストの内側余白 |
| `--svg-text` | `20` | 図形内テキストの基準px（最小16） |
| `--svg-accent-max` | `2` | 主強調色は1–2色まで |

ルール:
- SVGサイズは `![h:...]` / `![w:...]` で個別指定せず、`visual*` class側CSS（`--img-h-*`）で制御する。
- 構造図/フロー図はSVGとしてレビュー可能な形を優先し、本文を図に詰め込まない。

---

## 5. Color tokens

| token | 値 | 用途 |
|-------|----|----|
| `--c-text` | `#1d2330` | 本文・見出し |
| `--c-muted` | `#5b6472` | 補足・キャプション |
| `--c-accent` | `#2f6df0` | 主強調（リンク・キーワード・図の主線） |
| `--c-success` | `#1f9d6b` | COMPLETE / GO / read-only validation |
| `--c-warning` | `#d9822b` | replan / NO-GO / 未収束 |
| `--c-border` | `#d5dae3` | 区切り線・カード枠 |
| `--c-surface` | `#f5f7fb` | カード/コード背景 |

ルール:
- 強調色は `--c-accent` を主にする。`--c-success`/`--c-warning` は成功/差し戻し/未収束を表す semantic color として必要な場合だけ併用できる。
- 任意の新規hexをスライドに直書きしない。

---

## 6. QA rules（検出基準）

`SLIDES.md` レビュー時、以下を検出する。閾値超過は finding 化する。

| 検出項目 | 基準 | severity 目安 |
|---------|------|-------------|
| token外の個別値 | `font-size` / `color` / `gap` / `padding` 等にtoken外の生値が出現 | major |
| 負のletter-spacing | `letter-spacing` が負値、または `--ls-base` 以外を直書き | major |
| 過度な上寄り/左寄り | `single`/`compare` で縦 `center` を外し上寄せ、または左偏重で右に大きな空白 | minor |
| 図の過小 | `visual-full` でSVG実効高が `--img-h-full` の70%未満（≒39vh未満）に見える | major |
| 画像サイズ個別指定 | `![h:...]` / `![w:...]` をSVGに付与 | major |
| 強調色の過多 | 主強調色が3色以上、または semantic color が意味づけなく装飾的に使われる | minor |
| speaker notes欠落 | スライドにHTMLコメントnotesが無い | blocker |
| bullet過多 | 1スライド6 bullet以上（plan上限は5） | minor |

---

## 7. front matter 転記メモ

`SLIDES.md` の `<style>`（front matter）には、§1–§5 の token を `:root` に置き、
§3 の class を token 参照で定義する。スライド本文では `<!-- _class: ... -->` のみで
レイアウトを切り替え、個別の inline style を書かない。
