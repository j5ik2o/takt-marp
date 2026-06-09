承認済みのplanからdeck-localな軽量デザインシステムを作成してください。

**やること:**
1. `brief.normalized.md`、`plan.md`、既存の `SLIDES.md` があれば確認してください。
2. `slides/<deck>/design-system.md` を作成または更新してください。
3. typography、spacing、layout、visual、color、QA rules をdeck単位のtokenとして定義してください。
4. tokenは `SLIDES.md` のfront matter CSSに転記しやすい名前にしてください。
5. スライドごとの個別調整ではなく、classとCSS変数で一括制御できる設計にしてください。
6. planの `Layout` に対応する `title`、`single`、`visual`、`visual-dense`、`visual-full`、`split-50-50`、`split-45-55`、`split-40-60`、`split-60-40`、`compare-2col` の使い分けを定義してください。

**必須項目**
- Typography tokens: font family、letter-spacing、H1、lead、bullet、code label、line-height
- Spacing tokens: section padding、column gap、list gap、image margins
- Layout tokens: 1列/2列のclass、列比率、align-items、画像最大高
- Visual tokens: SVG viewBox、外周余白、図形内余白、SVG text size
- Color tokens: text、muted、accent、success、warning、border、surface
- QA rules: token外の個別値、負のletter-spacing、過度な上/左寄り、図の過小を検出する基準

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
