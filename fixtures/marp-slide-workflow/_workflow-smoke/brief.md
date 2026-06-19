# Workflow Smoke Deck Brief

## Event
- Name: 架空研修ラボ ドメインモデリング講座
- Date: 2031年4月17日（木）10:00〜16:30
- Duration: 360 minutes
- Venue: ミラージュホール A / サンプル配信スタジオ
- Organizer: サンプル研修ラボ株式会社
- Audience: メンテナとワークフロー検証者

## Goal
Marp slide TAKT workflow が、情報量の多い講義ブリーフから normalized brief、reference analysis、coverage matrix、slide blueprint、section source、HTML/CSS visual、SVG visual、review、build QA まで接続できることを確認する。

## Critical Constraints
- Official Title: 変更に強いドメインモデリングの実践ワークショップ
- Speaker Name: 山田 サンプル
- Speaker Affiliation: サンプルデザイン合同会社
- Design: 白基調だが白黒ではない。カラー印刷を前提に、青・緑・橙・赤を意味づけて使う。
- Information Density: 投影だけでなく印刷配布テキストとして読める密度を許容する。

### Fixed Outline
1. 入力を正にする
（1）briefを保全する
a. 正式タイトル、講師名、所属を落とさない
b. 禁止語と避けるべき表現を保持する
（2）事実を棚卸しする
a. 架空の日時、主催、形式、対象、場所をFact Inventoryに残す
b. Target slide countと要求密度の矛盾をfindingにする
2. 設計をplanへ渡す
（1）coverage matrixを作る
a. 固定アウトラインの全leaf項目をslide IDへ対応させる
b. 未対応項目はneeds_inputではなくPlan Findingsへ残す
（2）visual strategyを決める
a. カード、比較、表、軽量フローはhtml:で構成する
b. 座標制御や複雑な矢印だけsvg:またはinline-svg:にする
3. section sourceからassembleする
（1）blueprintを分ける
a. slide-blueprint.mdにcontent atomsとsection manifestを残す
b. sections/*.mdからSLIDES.mdへassembleする
（2）deliveryを検証する
a. HTMLとPDFをbuildできることを確認する
b. generated artifactをsource artifactへ混ぜない

## Core Message
半自動のMarp生成workflowは、入力、coverage、blueprint、section source、visual、レビュー、QAを分離すると安定する。

## Audience Context
聴衆はこのリポジトリのメンテナであり、TAKTとMarpの基本を理解している。

## Required Topics
- 1. 入力を正にする > （1）briefを保全する > a. 正式タイトル、講師名、所属を落とさない
- 1. 入力を正にする > （1）briefを保全する > b. 禁止語と避けるべき表現を保持する
- 1. 入力を正にする > （2）事実を棚卸しする > a. 架空の日時、主催、形式、対象、場所をFact Inventoryに残す
- 1. 入力を正にする > （2）事実を棚卸しする > b. Target slide countと要求密度の矛盾をfindingにする
- 2. 設計をplanへ渡す > （1）coverage matrixを作る > a. 固定アウトラインの全leaf項目をslide IDへ対応させる
- 2. 設計をplanへ渡す > （1）coverage matrixを作る > b. 未対応項目はneeds_inputではなくPlan Findingsへ残す
- 2. 設計をplanへ渡す > （2）visual strategyを決める > a. カード、比較、表、軽量フローはhtml:で構成する
- 2. 設計をplanへ渡す > （2）visual strategyを決める > b. 座標制御や複雑な矢印だけsvg:またはinline-svg:にする
- 3. section sourceからassembleする > （1）blueprintを分ける > a. slide-blueprint.mdにcontent atomsとsection manifestを残す
- 3. section sourceからassembleする > （1）blueprintを分ける > b. sections/*.mdからSLIDES.mdへassembleする
- 3. section sourceからassembleする > （2）deliveryを検証する > a. HTMLとPDFをbuildできることを確認する
- 3. section sourceからassembleする > （2）deliveryを検証する > b. generated artifactをsource artifactへ混ぜない

## Optional Topics
- appendixは必要な場合だけ作る

## Avoid
- Web画像の自動取得
- 他deck画像の自動流用
- 長い本文をスライドに詰め込むこと
- SVG-firstという方針に戻すこと
- htmlで十分なカード、比較、表、軽量フローをSVG化すること
- サンプル主催名、架空日付、架空場所を実在情報に置き換えること

## Source Materials
- docs/marp-slide-workflow.md
- _workflow-smoke internal synthetic brief only

## Speaker Notes
短い確認用deckなので、各スライドのnotesは2-3文でよい。Durationが分単位で指定されているため、notesには尺マーカーを付ける。

## Output Requirements
- Format: Marp
- Language: Japanese
- Target slide count: 5
- Deck Mode: overview
- Deliverables: html, pdf
- Slide Count Consistency Scenario: Target slide count: 5 は概要版として扱う。講義本体を要求する場合は100〜140または期待値相当へ修正する必要がある、というPlan Findingを作れること。
- Visual scope: html: cards/comparison/table/light-flow を優先し、座標制御が必要な1箇所だけ inline-svg: を使う。未使用SVG placeholderを計画しない。

## Fact Inventory
- 主催: サンプル研修ラボ株式会社
- 形式: ミラージュホール A / サンプル配信スタジオ
- 日時: 2031年4月17日（木）10:00〜16:30
- 対象: メンテナとワークフロー検証者
- 場所: ミラージュホール A
- 講師所属: サンプルデザイン合同会社

## Terminology Policy
- Domain-Driven Design はドメイン駆動設計と表記する。
- Workflow は workflow と英字表記で統一する。
- Fixed Outline の語句は言い換えない。

## Example Policy
- 共通題材は「備品購入申請・承認」とし、章をまたいで一貫利用する。

## Code Example Policy
- Java風の疑似コードでBefore / Afterを示す。
- 業務の意味がコード構造へ表れることを示す。
- フレームワーク固有APIへ寄せすぎない。

## Exercise Policy
- 短時間の個人演習にする。
- 模範回答または解説を巻末またはnotesに残す。

## Appendix Requirements
- 用語集
- 実践チェックリスト
- 演習模範回答

## Quality Checklist
- 正式タイトル完全一致
- 講師所属がサンプルデザイン合同会社
- 禁止語を使わない
- 固定アウトラインを変更しない
- 白基調だが白黒ではない
- coverage matrixに全leaf項目がある
- html: visual と svg:/inline-svg: visual の責務が分かれている
- sections/*.mdからSLIDES.mdへassembleできる
- build:html / build:pdf が成功する
