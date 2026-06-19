{extends:design-fidelity}

# Visual構成ポリシー

Marpスライド内の図解は、まず section source と assembled `SLIDES.md` 内のHTML/CSSで構成できるかを判定する。SVGは既定値ではなく、座標制御・矢印密度・再利用性・単体レビュー性が必要な場合に限定して使う。

## 原則

| 原則 | 基準 |
|------|------|
| HTML/CSS-first | カード、比較、表、簡単なフロー、タイムライン、チェックリスト、コード対比は `SLIDES.md` 内のHTML/CSSで作る |
| SVG-limited | 座標指定、複雑な矢印、関係マップ、トポロジ、再利用図版、単体差分レビューが必要なものだけSVGにする |
| render owner明示 | planの `Visual:` には visual種別と `render_owner` を明示し、compose/generate の責務を分ける |
| 1 visual 1 message | 1つの図解に複数の主張を詰め込まない |
| token駆動 | 個別styleではなく `design-system.md` のclassとCSS変数で制御する |
| 可読性優先 | 印刷配布と投影の両方で読める文字量・余白・コントラストにする |
| 差分レビュー可能 | HTML構造、class名、SVG要素名を意味単位で整理し、過度なminifyを避ける |

## Visual種別

| 種別 | 適したケース | render owner |
|------|-------------|--------------|
| `none` | 文章だけで十分なスライド | `compose_sections` |
| `html: ...` | カード群、2列比較、Before/After、手順、タイムライン、表、軽量な関係図、コード注釈 | `compose_sections` |
| `svg: ...` | 複雑な矢印、座標固定の概念図、再利用する構造図、単体ファイルとしてレビューしたい図版 | `generate_visuals` |
| `inline-svg: ...` | スライド固有でCSS変数と一体化させたいが、HTML/CSSだけでは座標表現が不十分な図版 | `generate_visuals` |
| `existing: ...` | brief/source materialで明示された既存画像・図版 | `generate_visuals` |

## HTML/CSSで構成する図解

- `html:` visual は compose_sections が section source に直接HTML構造を書く。placeholderにせず、本文と同じ差分でレビューできる状態にする。
- `html:` visual を使う場合は、front matter に `html: true` を設定する。
- HTML図解は `design-system.md` に定義したclassだけを使い、スライドごとの `style=""` や個別CSS追加を避ける。
- カードやボックス内の文字がはみ出す場合は、文字を削る、カード数を減らす、スライドを分ける、grid列数を変える順で調整する。
- 矢印はCSS border、疑似要素、短い記号で表現できる範囲に留める。複雑な交差・曲線・多段接続が必要ならSVGへ切り替える。
- HTML表・比較表は、罫線より余白・見出し帯・背景色で構造を見せる。白基調を保ちつつ、白黒だけにしない。

## SVGを使う基準

SVGは次のいずれかを満たす場合に使う。

- ノードと矢印の位置関係が主張の中心で、HTML/CSSのflow layoutでは意味が崩れる。
- 交差回避、曲線、階層関係、座標固定が必要。
- 同じ図版を複数スライドで再利用する。
- 単体SVGファイルとしてレビュー・差し替え・比較したい。
- 既存画像や外部素材ではなく、構造説明として厳密な図面が必要。

反対に、次はSVGにしない。

- 3〜6個のカードを並べるだけの比較。
- Before/After、原因/対策、入力/出力の2列比較。
- 箇条書きにアイコンやラベルを添えた手順。
- 表形式で説明できる分類。
- コード例への簡単な注釈。

## SVG制約

- 外部SVGは原則 `images/*.svg` として保存し、Marpから相対参照する。
- inline SVG は `inline-svg:` で明示された場合だけ使う。
- `viewBox` は原則 `0 0 1100 540`。
- font-family は `'Noto Sans JP','Hiragino Sans','Yu Gothic',sans-serif`。
- 背景は白または透明。
- SVG全体の面積配分は「図版9:余白1」を目安にし、意味のある要素がキャンバスの約90%を使うように配置する。
- 外周余白は `viewBox 0 0 1100 540` で左右20-30px、上下16-24pxを目安にする。
- 図形内テキストは左右20px以上、上下12px以上の内側余白を残す。
- 日本語本文は1行18文字程度、英数字ラベルは1行16文字程度を上限にし、長いラベルは `tspan` で分割する。
- `textLength` や横方向scaleで無理に縮めず、箱を広げる、文字を短くする、行を分ける、font-sizeを下げる順で調整する。
- 強調色は1-2色まで。赤は問題提起、警告、強い否定に限定する。
- 影、グラデーション、装飾は最小限にする。

## Marp配置制約

- HTML/CSS図解もSVGも、表示サイズは個別のMarkdown画像サイズではなくclass側CSSで制御する。
- 標準classは `visual`、本文が多い場合は `visual-dense`、図だけを大きく見せる場合は `visual-full` を使う。
- `visual` の目安は `--visual-max-height: 280px` から `300px`。`visual-dense` は `240px` から `260px`、`visual-full` は `360px` から `410px` を目安にする。
- `![w:900]` 以上の幅指定は、本文がほぼないスライドに限定する。
- SVG単体の `viewBox` 内に収まっていても、Marpに配置した結果スライド枠からはみ出す場合は失敗として扱う。

## 禁止事項

- HTML/CSSで十分なカード・比較・表をSVG化する。
- SVG内に長文を詰め込む。
- テキストが図形やカードからはみ出した状態で残す。
- 図形幅より明らかに長い単一行ラベルを置く。
- Marp配置時にスライド枠から図の一部が切れる状態で残す。
- 読めないほど文字を圧縮・縮小して収める。
- AI生成ラスター画像に構造説明や文字情報を任せる。
