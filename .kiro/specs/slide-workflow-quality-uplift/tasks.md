# 実装計画

- [ ] 1. 基盤: 語彙・機械規約の単一定義源
- [x] 1.1 リポジトリ規約 knowledge に layout 語彙表を追加し stale 記述を削除する
  - 基本 12 class(title, single, visual, visual-dense, visual-full, split-50-50, split-45-55, split-40-60, split-60-40, compare-2col, infographic, code-2col)に用途 1 行と構造ヒントを付した語彙表を `takt-marp-repo-conventions.md` に追加する
  - modifier(profile→single、layers→infographic、dual、tag-*)を適用先 base class 付きで区分し、単独使用不可を明記する
  - 削除済み Kroki への言及を削除する
  - 完了条件: 参照実装 `slides/takt-sdd/SLIDES.md` の全 `_class:` 使用が語彙表の正しい区分でカバーされ、Kroki 言及が 0 件になる
  - _Requirements:_ 1.1
  - _Boundary:_ C1 layout 語彙基盤
  - _Depends:_ none

- [x] 1.2 リポジトリ規約 knowledge に font 規約と html front matter 規約を追加する
  - 日本語優先フォールバックスタック必須+`@font-face` は `SLIDES.md` からの相対 path が実在する場合のみ任意、の 2 層 font 規約を記述する
  - HTML 要素(inline SVG 含む)使用時は front matter `html: true` を必須とする規約を記述する
  - 完了条件: 両規約が `takt-marp-repo-conventions.md` に記載され、後続 policy/instruction が参照できる規約文として成立している
  - _Requirements:_ 6.1, 6.2
  - _Boundary:_ C1 layout 語彙基盤
  - _Depends:_ none

- [ ] 2. コア: 品質定義 facet の改訂
- [ ] 2.1 plan の Layout 指定を基本語彙+custom 句に開放する
  - `takt-marp-plan.md`(instruction)と `takt-marp-slide-plan.md`(output contract)のインライン enum を撤去し、語彙表参照+`custom: <kebab-case-class> — <用途1行>` 句に置換する
  - `deliverables:` 行と Deck Summary 構造には触れない
  - 完了条件: plan が基本語彙外の layout を `custom:` 句で要求できる記述になり、旧 enum の複製が両ファイルから消える
  - _Requirements:_ 1.1, 1.2
  - _Boundary:_ C2 layout 計画・実現規約
  - _Depends:_ 1.1

- [ ] 2.2 design-system instruction に新 class 定義権限と文書化規約を追加する
  - 閉集合 enum を語彙表参照に置換し、plan の `custom:` 句に対応する class の定義権限を与える
  - 命名規約(kebab-case、既存 token 体系との整合)と deck-local `design-system.md` への文書化規約(class 名・用途・構造・使用スライド番号)を記述する
  - 完了条件: 新 class が「review/fix が識別できる形」で文書化される規約が instruction に存在する
  - _Requirements:_ 1.1, 1.2, 1.3
  - _Boundary:_ C2 layout 計画・実現規約
  - _Depends:_ 1.1

- [ ] 2.3 (P) inline SVG を規約付き許可に反転し生成所有権を定義する
  - `takt-marp-svg-first-visual.md` の禁止事項から inline SVG 行を削除し、外部 SVG と inline SVG の使い分け基準節を追加する
  - inline SVG 規約(フォントスタック・スライド領域内 containment・`html: true` 前提)を追加する
  - svg-first-visual の長文禁止規則と文字量上限を inline SVG にも明示的に適用した記述を置く(新規基準の発明はしない)
  - `takt-marp-visual-generate.md` を両形式対応にし、SVG markup の作成・修正は generate_visuals が所有(compose_slides は placeholder まで)と明記する
  - 完了条件: policy に inline SVG を違反扱いする記述が残らず、使い分け基準・inline 規約・長文規則の inline 適用が存在する
  - _Requirements:_ 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
  - _Boundary:_ C3 inline SVG ガードレール
  - _Depends:_ 1.2

- [ ] 2.4 (P) 尺契約と先鋭度・密度基準を一般品質 policy に追加する
  - `takt-marp-general-slide-quality.md` に Speaker Notes 尺契約節(canonical 尺マーカー `【N分 / 累計 M:SS】`、累計と発表時間の整合、強調点、発表時間未確定時の記載禁止)を追加する
  - 先鋭度基準(deck 固有要素を除去しても他 deck で成立する表現は汎用と判定)と密度基準(並列 bullet の表・カード・コード例への置換可能性判定)を追加する
  - 既存の severity 分類・完了判定節は変更しない
  - 完了条件: review が判定に使える具体的基準として両節が policy に存在する
  - _Requirements:_ 3.1, 3.3, 3.4, 5.1, 5.2
  - _Boundary:_ C4 尺契約・先鋭度密度基準
  - _Depends:_ none

- [ ] 2.5 (P) brief 正規化に発表コンテキストの確認・収集を追加する
  - `takt-marp-normalize-brief.md` にイベント名・発表時間の確認必須(欠落は「未指定」明示+Non-blocking notes 記録)と、登壇者プロフィール・事実インベントリの推奨収集を追加する
  - `takt-marp-normalized-brief.md` contract の必須内容に `Event Context` / `Speaker Profile` / `Fact Inventory` を追加する(値が無い場合も節必須で「未指定」記載)
  - intake の hard-block 必須見出しと normalize の needs_input 条件は変更しない
  - 完了条件: 正規化結果に 3 節が常に出力され、欠落が「未指定」として artifact に残る契約になっている
  - _Requirements:_ 4.1, 4.2, 4.5
  - _Boundary:_ C6 発表コンテキスト入力
  - _Depends:_ none

- [ ] 2.6 (P) Marp 固有 policy に機械的規約と捏造禁止を追加する
  - `takt-marp-slide-quality.md` の Marp Front Matter 節に `html: true` 規約、Typography 節に font path 規約(スタック必須+@font-face は path 実在時のみ)を追加する
  - 入力根拠節に「brief に存在しないイベント名・実績数値・version を生成・補完しない」を特化追記する
  - 完了条件: 3 規約が policy に存在し、C1 の規約文と矛盾しない
  - _Requirements:_ 4.4, 6.1, 6.2
  - _Boundary:_ C7 機械的規約・捏造禁止
  - _Depends:_ 1.2

- [ ] 2.7 compose の生成規約に尺・コンテキスト・機械規約適合を追加する
  - `takt-marp-compose-slides.md` に notes 生成規約(発表時間がある場合のみ尺マーカー+累計整合、各 notes に強調点、未確定時はマーカー禁止)を追加する
  - `Event Context` のイベント名をタイトルスライドへ、`Speaker Profile` を自己紹介相当スライドへ反映し、「未指定」項目は反映も捏造もしない規約を追加する
  - HTML 要素使用時の `html: true` 設定と font 規約適合(path 実在確認)の手順を追加する
  - SVG markup を書かず placeholder 配置までを所有することを明記する
  - 完了条件: compose_slides の手順が C1/C3/C4/C6/C7 の規約・契約と整合した生成規約を持つ
  - _Requirements:_ 3.1, 3.3, 3.4, 4.3, 4.4, 6.1, 6.2
  - _Boundary:_ C5 compose 生成規約
  - _Depends:_ 2.3, 2.4, 2.5, 2.6

- [ ] 2.8 compose review に品質検出観点を追加する
  - `takt-marp-compose-review.md` の読み込み対象に `brief.normalized.md` を追加する
  - 観点を追加する: (a) plan の Layout と `_class:` 使用に対応する style 定義・design-system 文書化の存在照合 (b) inline SVG の規約適合 (c) 尺マーカーの累計整合と発表時間未指定時の捏造検出 (d) 先鋭度・密度 (e) `html: true` 欠落と font path 解決不能
  - severity 既定(設計のエラーハンドリング節)に従い、report front matter・Findings テーブル・severity 分類は変更しない
  - 完了条件: 7 検出系要件の全観点が review instruction に存在し、既存 report 契約のまま報告される
  - _Requirements:_ 1.4, 2.4, 2.6, 3.2, 5.1, 5.2, 5.3, 6.3
  - _Boundary:_ C8 review 観点拡張
  - _Depends:_ 2.2, 2.3, 2.4, 2.5, 2.6, 2.7

- [ ] 3. 統合: 横断整合と配布同期
- [ ] 3.1 workflow ドキュメントの語彙・テンプレートを同期する
  - `docs/marp-slide-workflow.md` の brief テンプレートに `## Speaker Profile` / `## Fact Inventory` を追加する(`## Event` は既存)
  - 同ドキュメントの Layout 語彙節を語彙表(基本+modifier+custom 句)と同期する
  - 完了条件: docs の語彙・テンプレートが facet 側の定義と矛盾しない
  - _Requirements:_ 1.1, 4.1, 4.2, 4.5
  - _Boundary:_ C2, C6 にまたがる docs 統合タスク
  - _Depends:_ 1.1, 2.1, 2.2, 2.5

- [ ] 3.2 facet 間の責務宣言と語彙参照の整合を検証する
  - general-slide-quality / slide-quality / svg-first-visual の「扱うこと/扱わないこと」宣言が改訂後も相互矛盾しないことを確認し、必要なら宣言を修正する
  - grep で旧 Layout enum の複製が `.takt` / `docs` / `templates` に残存しないことを確認する
  - 参照実装の全 `_class:` が語彙表で正しい区分のままカバーされることを突合する
  - 完了条件: 旧 enum 残存 0 件、責務宣言の矛盾 0 件、参照実装カバレッジ 100%
  - _Requirements:_ 7.1
  - _Boundary:_ C3, C4, C7 にまたがる整合検証の明示的統合タスク
  - _Depends:_ 2.4, 2.6, 2.7, 2.8

- [ ] 3.3 配布 template を同期し drift 検証を成功させる
  - `npm run installer:sync-templates` を実行して `templates/project/facets/**` を同期する(手編集しない)
  - 完了条件: `npm run installer:check-templates` が green
  - _Requirements:_ 7.2
  - _Boundary:_ C9 配布同期
  - _Depends:_ 3.2

- [ ] 4. 検証: 回帰と非破壊確認
- [ ] 4.1 既存契約・smoke・既存 deck 非破壊の回帰検証を行う
  - `npm test`(foundation 回帰)と `npm run slide:smoke`(mock provider 全 command 遷移)を実行する
  - `npm run installer:check-package` で pack 境界を確認する
  - workflow YAML・scripts・report schema に差分が無いこと、`slides/takt-sdd/**` に差分が無いことを git status / git diff で確認する
  - 完了条件: 全コマンド green、YAML/scripts/参照 deck の差分 0
  - _Requirements:_ 7.1, 7.3, 7.4
  - _Boundary:_ 検証
  - _Depends:_ 3.3

## Implementation Notes
