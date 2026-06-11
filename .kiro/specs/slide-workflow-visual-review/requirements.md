# 要件定義

## プロジェクト説明（入力）
slide workflow の利用者は、テキスト(markdown)レビューしか持たない現行 workflow では、フォント崩れ・サイズ不整合・レイアウト破綻などの視覚品質問題を workflow 内で発見できず、人間が render 結果を目視して初めて修正できる状態にある(takt-sdd deck の churn 最大カテゴリ ~30% がビジュアル設計)。polish の render evidence は既に per-slide PNG(`html_png`)を生成しているが、その内容を知覚する step が存在しない。

本機能は、polish の render evidence cycle に multimodal visual review step を追加し、render 済み PNG を reviewer persona が知覚して視覚品質の findings(overflow、フォント崩れ、コントラスト不足、余白破綻、図の可読性、class 適用ミス)を構造化 report として出力し、findings がある場合は fix → 再 render → 再 review の閉ループ(AI quality gate と同型、loop monitor による ABORT ルーティング付き)で収束させる。判定基準は slide-workflow-quality-uplift が確定させた語彙(layout class / SVG ガードレール / フォント規約)を参照し、mock provider では決定論的な合成 report により CI で検証可能とする。command surface・render evidence 生成機構・report schema は変更しない。

詳細は同ディレクトリの `brief.md`(問題・アプローチ・スコープ・境界候補・制約)を参照。

## 要件
<!-- /kiro-spec-requirements フェーズで生成されます -->
