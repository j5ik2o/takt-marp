承認済みのplanからdeck-localな軽量デザインシステムを作成してください。

**やること:**
1. `brief.normalized.md`、`plan.md`、`slide-blueprint.md`、既存の `SLIDES.md` があれば確認してください。
2. `slides/<deck>/design-system.md` を作成または更新してください。
3. typography、spacing、layout、visual、color、QA rules をdeck単位のtokenとして定義してください。
4. tokenは `SLIDES.md` のfront matter CSSに転記しやすい名前にしてください。
5. スライドごとの個別調整ではなく、classとCSS変数で一括制御できる設計にしてください。
6. planの `Layout` に対応する class の使い分けを、knowledge `takt-marp-repo-conventions` の「Layout 語彙」表に従って定義してください。
7. planの `Layout` に `custom: <class名> — <用途>` 句がある場合、同名 class を新規定義してください。命名は kebab-case とし、deck の既存 token 体系(CSS 変数・class 命名)と整合させてください。
8. plan の `Visual:` が `html:` の場合は、section source と assembled `SLIDES.md` 内HTML/CSSで使うcomponent class、grid、カード、比較、フロー、タイムライン、コード注釈の構造をtoken化してください。
9. plan の `Visual:` が `svg:` / `inline-svg:` の場合だけ、SVG viewBox、外周余白、図形内余白、SVG text size をtoken化してください。
10. 新規定義した class(および使用する modifier の組み合わせ)を deck-local `design-system.md` に以下の項目で文書化してください。後続の review / fix がその class を識別できる記述にしてください。
   - class 名
   - 用途(1行)
   - 構造(CSS レイアウト・HTML 構造の概要)
   - 使用スライド番号

**必須項目**
- Typography tokens: font family、letter-spacing、H1、lead、bullet、code label、line-height
- Spacing tokens: section padding、column gap、list gap、image margins
- Layout tokens: 1列/2列のclass、列比率、align-items、画像最大高
- Visual tokens: HTML visual components(カード、比較、表、フロー、タイムライン、コード注釈)、visual container、grid gap、カード内余白、アイコン/ラベル、SVGを使う場合のみSVG viewBox、外周余白、図形内余白、SVG text size
- Color tokens: text、muted、accent、success、warning、border、surface
- QA rules: token外の個別値、負のletter-spacing、過度な上/左寄り、HTML/CSSで足りる図解の過剰SVG化、図の過小を検出する基準

**禁止事項**
- deck全体で使わないtokenを大量に増やさないでください。
- スライドごとの個別CSSを前提にしないでください。
- `brief.md` や `plan.md` の中心メッセージを変更しないでください。

**必須出力**
## Design System Result
- Status: designed / needs_input
- Design system file:
- Token groups:
- Layout classes:
- QA rules:
- Files changed:
