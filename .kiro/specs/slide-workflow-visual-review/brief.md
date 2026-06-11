# ブリーフ: slide-workflow-visual-review

## 問題

slide workflow はテキスト(markdown)のレビューしか行わず、**誰も描画されたスライドを見ていない**。takt-sdd deck の実運用では、フォント崩れ・サイズ不整合・レイアウト破綻などの視覚品質問題は「人間が render 結果を見た」ことでのみ発見・修正された(churn の最大カテゴリ ~30% がビジュアル設計)。知覚なしには、この品質次元は workflow の原理的な到達不能領域として残る。

## 現状

- polish の render evidence は既に per-slide PNG(`html_png`)、pdf、pdf_raster を `.takt/render/<deck>/cycle-N/` に生成しているが、その検証は metadata(存在・鮮度)ベースで、内容を知覚する step がない。
- TAKT の persona/agent は provider 経由で画像入力(multimodal)を受け取れる(takt コントリビューターである作者が確認済み)。
- AI quality gate(`takt-marp-slide-ai-quality-gate.yaml`)が「検出 → 修正 → 再検証の閉ループを workflow 内に組み込む」実証済みパターンを提供している。
- 視覚品質の判定基準の語彙(layout class、SVG ガードレール、フォント規約)は slide-workflow-quality-uplift が確定させる。

## 目指す状態

polish 実行時に、render された PNG を multimodal reviewer persona が知覚し、視覚品質の findings(overflow、フォント崩れ、コントラスト不足、余白破綻、図の可読性、class 適用ミス)を構造化 report として出力する。findings がある場合は fix → 再 render → 再 review の閉ループで収束し、収束しないループは loop monitor で ABORT へルーティングされる。mock provider では決定論的な合成 report により CI で検証可能。

## アプローチ

検討した案:

1. **polish の render evidence cycle に multimodal visual review step を追加(採用)** — 既存の `html_png` を reviewer persona に渡し、AI quality gate と同型の閉ループ(review → fix → 再検証)を polish 内に組み込む。既存資産(render evidence、閉ループパターン、report schema)を最大活用し、command surface は不変。
2. 独立 command / workflow 化(棄却) — command surface が広がり、「トップレベルは plan / compose / polish / deliver に絞る」という roadmap 思想に反する。
3. compose 段階での視覚チェック(棄却) — render evidence は polish の責務であり、compose 成果物への render は責務の重複と実行コスト増を招く。

実装方針: polish workflow に visual review step(multimodal reviewer persona + 判定基準 instruction + output contract)を追加し、findings は既存 report 規約(front matter による target / generated_at / workflow_run_id の鮮度判定)に従う report として deck review 配下へ同期する。fix step は SLIDES.md / CSS の修正に限定し、再 render は既存 render evidence 機構を再実行する。

## スコープ

- **対象範囲**:
  - polish workflow YAML への visual review / fix / 再検証ループの step 追加
  - multimodal visual reviewer persona、視覚判定基準 instruction、visual review report の output contract(facets 新規)
  - PNG を persona へ渡す入力経路の設計(TAKT の画像入力機構の利用方法の確定)
  - visual review report の deck review への同期(runner の既存 report sync 規約に整合)
  - loop monitor による非収束ループの ABORT ルーティング
  - mock provider での決定論的な合成 visual review report と smoke 検証の拡張
  - 判定基準は slide-workflow-quality-uplift が確定させた語彙(layout class / SVG ガードレール / フォント規約)を参照する
- **対象外**:
  - render evidence 生成機構の再設計(既存の html_png / pdf_raster をそのまま使う)
  - deliver の official artifact 検証(polish の render evidence と deliver の成果物分離は既存設計のまま)
  - command surface の追加・変更
  - facets の品質定義そのものの改訂(quality-uplift が所有)
  - TAKT 本体の multimodal 機構の変更
  - 人間の美的最終判断の置き換え(閉ループは床上げであり、好みの微調整は対話に残る)

## 境界候補

- Visual reviewer: PNG の知覚と findings 生成を所有する(persona + instruction + output contract)
- Visual fix: findings に基づく SLIDES.md / CSS 修正を所有する(修正範囲の制限規約付き)
- Loop 制御: 再 render → 再 review の収束判定と ABORT ルーティングを所有する(loop monitor)
- Mock 経路: CI 用の合成 report 生成と smoke 検証を所有する

## 境界外

- supervision / approval の所有権(既存 foundation 契約のまま。visual review は polish supervision の入力になる)
- report schema の再定義(front matter 規約は foundation 所有)
- 視覚品質「基準」の定義(quality-uplift 所有。本 spec は基準を「適用する」)

## 上流 / 下流

- **上流**: slide-workflow-quality-uplift(判定基準の語彙)、slide-workflow-foundation(report schema・sync 規約)、slide-workflow-orchestration(polish workflow)、slide-workflow-ai-quality-gate(閉ループ・loop monitor パターン)
- **下流**: takt-marp-global-installer(workflow / facets 変更 → template 再同期と drift 検証が必須)、将来の deliver 側視覚検証(本 spec では扱わない)

## 既存 spec との接点

- **拡張**: slide-workflow-orchestration の polish workflow を改修する(spec は再オープンせず、本 spec が改修の責任を持つ)
- **隣接**: slide-workflow-smoke-validation — mock smoke の検証 phase 拡張は smoke script の既存契約(provider 分離・summary 規約)に整合させる。takt-marp-global-installer — template 再同期必須

## 制約

- プロジェクト内の spec/設計文書は日本語で書く
- Dependencies: slide-workflow-quality-uplift の完了後に着手する(判定基準の語彙が前提)
- workflow 実行は常に `--skip-git`(roadmap 制約)
- visual review report は `target` / `generated_at` / `workflow_run_id` を含む front matter で鮮度判定できること(foundation 規約)
- mock provider の CI 必須検証を壊さない(real provider の視覚 review を CI 必須にしない)
- 設計フェーズで TAKT の画像入力の具体的な受け渡し方法(workflow YAML での指定方法、サイズ/枚数制限)を確認すること
- facets / workflow 変更は `installer:sync-templates` → `installer:check-templates` green とセットで完結させる
