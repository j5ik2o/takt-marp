# Marpスライド品質ポリシー

Marp Markdown、front matter、deck local artifact としての制約を守る。
スライド一般の品質基準は `takt-marp-general-slide-quality`、SVG固有の品質基準は `takt-marp-svg-first-visual`、worker の禁止事項は `takt-marp-worker-boundary` に委譲する。

## 責務の境界

**このポリシーが扱うこと:**
- `SLIDES.md` の Marp front matter と Markdown 構造
- speaker notes、HTML comment、Marp directive の使い分け
- `slides/<deck>/` 配下の source artifact 参照
- `brief.md`、`brief.normalized.md`、`plan.md`、`design-system.md`、`SLIDES.md`、`images/*.svg` の境界

**このポリシーが扱わないこと:**
- 1スライド1メッセージ、情報密度、finding severity などの一般品質
- SVG の viewBox、図形内テキスト、表示サイズ、visual fidelity
- worker の git 操作禁止、approval 生成禁止、TAKT 再起動禁止

## Marp Front Matter

- `marp: true` を維持する。
- deck 固有の theme、paginate、class、style は既存 deck の作法に合わせる。
- `style` block は Marp 表示に必要な最小限にし、長大な設計説明を入れない。
- `header`、`footer`、`paginate` を変更する場合は、既存 deck の意図と表示範囲を確認する。
- `brief.md` や `plan.md` の自由記述を front matter へ無断で転記しない。
- `SLIDES.md` 本文に HTML 要素(inline SVG 含む)を含める場合、front matter に `html: true` を設定する。

## Marp Markdown

- slide delimiter は `---` で統一する。
- speaker notes は Marp の notes 用コメントとして本文から分離する。
- HTML comment は Marp directive または speaker notes に限定し、作業メモを残さない。
- local image path は deck directory からの相対参照にそろえる。
- `SLIDES.md` から `dist/` や `.takt/render/` の生成物を参照しない。

## Typography

- 文字間は原則 `letter-spacing: 0` とし、見出しや本文で負のletter-spacingを使わない。
- 日本語本文の `line-height` は `1.25` から `1.45`、短いbulletは `1.2` から `1.35`、小さな注釈は `1.25` 以上を目安にする。
- 見出し、lead、bullet、図内ラベルの階層差を保ち、同一スライド内で文字サイズが過度にばらつかないようにする。
- font style には日本語優先フォールバックスタックを必ず指定する。
- `@font-face` を宣言する場合は、`SLIDES.md` からの相対 path が実在するファイルのみを参照する(path が存在しない環境では `@font-face` を省略し、フォールバックスタックのみで描画する)。

## Layout Selection

- 1列は、短い本文だけで主張を伝えるスライド、タイトル、結論、強いメッセージに使う。
- 2列は、本文と図を同時に見せたい場合、before/after、原因/対策、入力/出力、手順/成果物、比較表現に使う。
- 2列で左右どちらかが窮屈になる場合は、比率変更、本文削減、speaker notes移動、スライド分割の順で調整する。
- 図が小さい問題は、画像サイズだけで解決せず、1列/2列の切り替えと列比率の見直しを先に検討する。

## 面内バランスと安全領域

- タイトル、lead、本文、図のまとまりが、スライド中央付近に自然な視覚重心を持つようにする。
- ページ番号、header、footerを避けつつ、本文と図の上下左右の余白が不自然に偏らないようにする。
- 図入りスライドの本文は原則3 bullet以内、最大4 bulletまでにする。5 bullet以上必要ならスライドを分割する。
- 2列レイアウトでは列間gapを24px以上確保し、左列・右列の本文や図がページ番号と干渉しないようにする。
- レンダリング後に上下左右の端で文字、図形、矢印、ページ番号が切れていないことを確認する。

## Deck Local Artifacts

- deck source は `slides/<deck>/` の下に閉じる。
- 画像は `slides/<deck>/images/` を優先し、他 deck の artifact を暗黙参照しない。
- source artifact と generated artifact を混同しない。
- `dist/<deck>/` と `.takt/render/<deck>/` は source artifact として編集しない。
- `review/*-approval.md` は worker が生成する artifact ではなく、人間操作の記録として扱う。

## 入力根拠

- Source Materials にない強い断定を Marp 本文へ追加しない。
- brief に存在しないイベント名・実績数値・version を生成・補完しない。
- URL を自動取得しない。必要なら review または supervision の human decision item に残す。
- `plan.md` の `deliverables` を delivery request の authoritative input として扱う。
- `brief.md` の自由記述と `plan.md` の正規化済み contract が矛盾する場合は、勝手に補正せず finding にする。
