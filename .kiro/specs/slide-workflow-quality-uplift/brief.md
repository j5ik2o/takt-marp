# ブリーフ: slide-workflow-quality-uplift

## 問題

slide workflow(plan / compose / polish / deliver)の産出物は、実運用(takt-sdd deck)で発表品質に到達できず、人手 + Claude Desktop との対話で大幅な修正(+575/-227 規模の再構築を含む計 5 commit)が必要だった。git 履歴の差分分析により、修正の churn は次の構成だった: ビジュアル設計 ~30%、構成・ナラティブ ~15%、メッセージ先鋭化 ~12%、情報密度 ~10%、具体的根拠 ~8%、聴衆適合 ~8%、機械的修正 ~2%。

facets カバレッジ分析の結論: これらの大半は「workflow が下手だった」のではなく、**facets が定義していない(layout 語彙・登壇者情報・尺契約)、禁止している(inline SVG)、または存在チェック止まりで水準を問わない(speaker notes・タイトル先鋭度)**品質次元である。

## 現状

- `takt-marp-design-system.md` は 7 つの layout class の閉じた列挙で、compose に語彙を拡張する権限がなく、review にも「plan の Layout に対応する class が無い」を blocker にする基準がない。対話フェーズで追加された `infographic` / `code-2col` / `profile` / `layers` / `dualbadge` / `tag-*` は workflow の枠内では生成不可能だった。
- `takt-marp-svg-first-visual.md` は「Marp 本文に inline SVG を埋め込む」を禁止しているが、最終形の最重要改善(日本語フォントスタック統一、`max-height` による CSS サイズ制御、per-SVG style)は inline SVG だから可能だった。
- speaker notes の品質基準は「各スライドに付ける」のみで、1 行の transition メモで合格する。最終形は `【X分 / 累計 Y:ZZ】` 付きの登壇スクリプトである。
- brief 正規化はイベント名・登壇者プロフィール・発表時間・事実インベントリ(version 文字列、数値根拠)を必須収集しないため、workflow は与えられていない情報を生成できなかった。
- review 基準に「タイトル/リードが汎用ラベルか主張か」「bullet を table / card / code に置換すべきか」を判定する観点がない。
- `@font-face` の相対パス深度や `html: true` front matter など、描画が壊れる機械的規約が明文化されていない。
- 実証済みの到達点が `slides/takt-sdd/SLIDES.md`(HEAD)として存在し、品質定義の正解データとして使える。

## 目指す状態

同じ brief を与えたとき、workflow 産出物への人手修正が「構造的再構築」ではなく「好みの微調整(数十行)」で済む。具体的には: plan が要求する layout が常に実現可能で、タイトル/リードが deck 固有の主張になり、speaker notes が発表時間と整合した尺配分を持ち、イベント・登壇者・事実根拠が成果物に反映され、フォント/front matter 起因の描画破損が起きない。

## アプローチ

facets / policies / output contracts / 必要最小限の workflow YAML 修正による品質定義の引き上げ。新しい script や state model は追加しない。実証済みの最終版 SLIDES.md を品質基準の参照実装として facets に反映する。

1. **layout 語彙の開放**: 実証済み class 群(`infographic` / `code-2col` / `profile` / `layers` / `dualbadge` / `tag-*`)を design-system instruction に正式採用。compose に「plan の Layout 要求に既存 class が合わない場合、命名・文書化規約に従って class を新設してよい」権限を付与。review に「Layout に対応する class 不在」を major finding とする基準を追加。
2. **inline SVG policy の反転**: 禁止 → ガードレール付き許可(長文流し込み禁止・フォントスタック規約 Noto Sans JP 優先・`max-height` 等のサイズ containment 規約・per-SVG style の統一規約)。外部 SVG 参照は引き続き許可(選択基準を明記)。
3. **speaker notes の尺契約**: output contract に `【X分 / 累計 Y:ZZ】` 形式の尺配分、brief の発表時間との累計整合、スライドごとの強調点を要求。review で累計時間の不整合を finding 化。
4. **brief 正規化の入力強化**: イベント名・発表時間を必須、登壇者プロフィール・事実インベントリ(version、数値、実績)を推奨項目として正規化契約に追加。欠落時は非ブロッキングで明示(生成側が捏造しない)。
5. **review 基準の引き上げ**: compose-review に先鋭度基準(「このタイトルは他のどの deck にも貼れるか」)と密度基準(bullet → table / card / code 置換判定)を追加。
6. **機械的規約の明文化**: `@font-face` 相対パス、フォント優先順(Noto Sans JP 先頭)、`html: true` の要否を design-system に明記。

## スコープ

- **対象範囲**:
  - `.takt/facets/instructions/`(design-system、plan、normalize-brief、compose 系)の改修
  - `.takt/facets/policies/`(svg-first-visual、general-slide-quality、slide-quality)の改訂
  - `.takt/facets/output-contracts/`(plan、compose review、speaker notes 関連)の契約強化
  - `.takt/facets/personas/`(writer / reviewer / planner)の必要最小限の更新
  - 上記に伴う canonical workflow YAML の参照整合(意味論は変えない)
  - `templates/project/**` の再同期(`installer:sync-templates`)と drift 検証 green
  - 改訂後 facets での mock smoke 回帰
- **対象外**:
  - workflow の command/state/report/approval contract の変更
  - 視覚フィードバックループ(slide-workflow-visual-review が所有)
  - facets の repo-local 参照(`npm run build:*`)の解消(portability の別件)
  - TAKT 本体・provider の変更
  - 既存 deck(takt-sdd)の再生成

## 境界候補

- Design system 語彙: layout class の定義・拡張規約・機械的規約を所有する
- Visual policy: SVG の利用方針(inline / 外部の選択基準とガードレール)を所有する
- Narrative / notes 契約: plan の構成要求・speaker notes の尺契約を所有する
- Brief 正規化入力: イベント・登壇者・事実インベントリの収集契約を所有する
- Review 基準: 先鋭度・密度・layout 実現可能性の判定基準を所有する

## 境界外

- render 結果の知覚に基づく判定(visual-review spec の責務)
- workflow の成功条件・状態遷移・approval ownership
- installer の template 配布機構(再同期は接点として実施するが、機構は global-installer 所有)

## 上流 / 下流

- **上流**: slide-workflow-orchestration(canonical workflow と facets の現行構造)、slide-workflow-ai-quality-gate(gate 設計パターン)、slide-workflow-foundation(report schema・review 契約)
- **下流**: slide-workflow-visual-review(本 spec の基準語彙を視覚判定に使う)、takt-marp-global-installer(facets 変更 → template 再同期と drift 検証が必須。installer design の再検証トリガー該当)

## 既存 spec との接点

- **拡張**: slide-workflow-orchestration の facets 資産を改訂する(spec は再オープンせず、本 spec が改訂の責任を持つ)
- **隣接**: takt-marp-global-installer — facets 変更ごとに `installer:sync-templates` を実行し CI の drift 検証を green に保つ

## 制約

- プロジェクト内の spec/設計文書は日本語で書く
- 品質基準の参照実装は `slides/takt-sdd/SLIDES.md`(HEAD)とし、基準の文言はそこから抽出した実証済みパターンに基づく
- facets の変更は必ず `installer:sync-templates` → `installer:check-templates` green とセットで完結させる
- 改訂後も mock smoke(`npm run slide:smoke`)が成功すること
- workflow YAML の step 構成・成功条件は変更しない(facets 参照の整合のみ)
- 入力欠落時の捏造禁止: brief に無いイベント名・実績数値を生成側が補完してはならない
