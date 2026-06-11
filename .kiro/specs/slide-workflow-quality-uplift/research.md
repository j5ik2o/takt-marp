# ギャップ分析: slide-workflow-quality-uplift

- 分析日: 2026-06-11
- 対象要件: `.kiro/specs/slide-workflow-quality-uplift/requirements.md`(7 要件 / 29 受け入れ基準)
- 参照実装: `slides/takt-sdd/SLIDES.md` HEAD(独自 layout class 7 種、inline SVG 8 箇所、尺マーカー【X分 / 累計 Y:ZZ】16 箇所、`html: true` front matter、`@font-face` による `@fontsource/noto-sans-jp` 相対参照)

## 1. 現状調査

### 1.1 facet 資産の全体像

| 種別 | 数 | 本 spec に関係する主要ファイル |
|------|----|------------------------------|
| instructions | 21 | `takt-marp-design-system.md`、`takt-marp-plan.md`、`takt-marp-intake.md`、`takt-marp-normalize-brief.md`、`takt-marp-compose-slides.md`、`takt-marp-visual-generate.md`、`takt-marp-compose-review.md`、`takt-marp-polish-inspect.md` |
| policies | 4 | `takt-marp-svg-first-visual.md`、`takt-marp-general-slide-quality.md`、`takt-marp-slide-quality.md` |
| output-contracts | 8 | `takt-marp-slide-plan.md`、`takt-marp-normalized-brief.md`、`takt-marp-command-review.md` |
| personas | 6 | (変更不要の見込み) |
| knowledge | 1 | `takt-marp-repo-conventions.md` |

### 1.2 再利用できる既存機構(本 spec で新設不要)

- **review/finding 契約**: `output-contracts/takt-marp-command-review.md` が front matter(`finding_count`、`blocking_finding_count` 等)と Findings テーブル(`finding_id`/`severity`/`status`/`cycle`/`location`/`issue`/`required_change`/`evidence`)を規定。severity 分類(blocker/major/minor/info)は `policies/takt-marp-general-slide-quality.md` が定義済み。→ 要件 1.4 / 2.4 / 2.6 / 3.2 / 5.1 / 5.2 / 6.3 の finding 報告はすべてこの既存契約に乗る(要件 5.3 の「既存 severity 分類と report 契約に従う」はこの再利用を指す)。
- **review→fix 閉ループ**: compose workflow は `review_compose ⇄ fix_compose` ループ + loop monitor(threshold 3)を持つ。review 観点を追加すれば fix まで自動で回る構造は既存。
- **brief 正規化の欠落明示機構**: `takt-marp-normalize-brief.md` の Non-blocking notes / Blocking issues と `takt-marp-normalized-brief.md` contract の `Non-blocking Notes` 見出し。→ 要件 4.1 / 4.5 の「欠落の明示」の置き場は既存。
- **発表時間の伝搬経路(部分的)**: `takt-marp-slide-plan.md` contract の Deck Summary に `Duration` が既存。→ 要件 3.1 の発表時間は plan までは流れるが、brief 正規化での必須確認(4.1)と notes への反映(3.1)が欠落。
- **template 配布同期**: `templates/project/{workflows,facets}` 45 ファイル + `npm run installer:sync-templates` / `installer:check-templates`(CI 強制)。→ 要件 7.2 は既存機構で充足。
- **mock smoke**: `npm run slide:smoke`。mock provider は facet 内容に依存しない合成レスポンスのため、facet 本文変更で壊れにくい。→ 要件 7.3 の検証手段は既存。

### 1.3 workflow YAML 構造の確認結果(要件 7.1 関連)

`takt-marp-slide-compose.yaml` を確認した結果、品質定義は全 step に `policy` 配列(4 policies)+ `instruction` + `knowledge` として注入されており、**facet 本文の改訂だけなら YAML(step 構成・rules・report 契約)は不変**。新 policy ファイルを追加する場合のみ YAML の `policies` マップと各 step の `policy` 配列への追記が発生するが、これは成功条件・状態遷移・report schema の変更ではないため要件 7.1 には抵触しない。

## 2. 要件→資産マップ

凡例: **Missing** = 該当する定義が存在しない / **Constraint** = 既存資産による制約 / **Unknown** = 設計フェーズで要調査

### 要件 1: layout 実現可能性

| 基準 | 既存資産 | ギャップ |
|------|---------|---------|
| 1.1 実証済み語彙の生成 | `takt-marp-design-system.md` が layout class を閉集合(title/single/visual/visual-dense/visual-full/split-50-50/split-45-55/split-40-60/split-60-40/compare-2col)で規定 | **Missing**: 実証済み語彙 `infographic`/`code-2col`/`profile`/`layers`/`dualbadge`/`tag-*` が未定義 |
| 1.2 新 class 定義権限 | なし(現状は閉集合で拡張不可) | **Missing**: 命名・文書化規約と拡張許可 |
| 1.3 新 class の文書化 | deck-local `design-system.md` という文書化先は既存 | **Missing**: 「review/fix が識別できる形」の文書化規約 |
| 1.4 style 未定義の review 検出 | `takt-marp-compose-review.md` の観点は content/flow/visual source/boundary のみ | **Missing**: plan Layout ↔ style 定義の照合観点(契約・severity は再利用可) |

**追加発見(Constraint)**: layout enum が二重管理されており既に不整合。`takt-marp-plan.md`(instruction)と `takt-marp-slide-plan.md`(contract)の enum には `visual-dense`/`split-45-55`/`title` が**ない**が、`takt-marp-design-system.md` にはある。語彙開放時にこの二重 enum(plan 側 2 ファイル + design-system 側 1 ファイル)の整合方法を設計で決める必要がある。

### 要件 2: inline SVG ガードレール

| 基準 | 既存資産 | ギャップ |
|------|---------|---------|
| 2.1 利用自体を違反としない | `takt-marp-svg-first-visual.md` 禁止事項に「Marp本文にinline SVGを埋め込む」が明記 | **Constraint**: 明示的禁止の反転(削除+許可条件の新設)が必要 |
| 2.2 日本語フォントスタック | 同 policy に `'Noto Sans JP','Hiragino Sans',sans-serif` 規約が既存(外部 SVG 向け) | Extend: inline SVG にも適用する旨の一般化のみ |
| 2.3 サイズ containment | Marp 配置制約(class 側 CSS 一括制御、`--visual-max-height` 目安)が既存 | Extend: inline SVG の containment(枠内収まり)へ拡張 |
| 2.4 長文流し込みの検出 | 禁止事項「SVG内に長文を詰め込む」が既存 | **Missing**: review 観点への昇格(compose-review に明示なし) |
| 2.5 使い分け基準 | なし(現状「別ファイル管理」一択) | **Missing**: 外部参照 vs inline の選択基準 |
| 2.6 規約不適合の review 検出 | なし | **Missing**: review 観点追加(契約は再利用) |

参照実装は inline SVG を 8 箇所で使用しており、最も寄与の大きい視覚技法が現 policy で禁止されている状態。`takt-marp-visual-generate.md`(SVG 生成 instruction)も外部ファイル前提のため改訂対象。

### 要件 3: speaker notes 尺契約

| 基準 | 既存資産 | ギャップ |
|------|---------|---------|
| 3.1 所要+累計時間 | general-slide-quality「各スライドにspeaker notesを付ける」(存在チェックのみ)、plan の `Speaker note intent`、contract の `Duration` | **Missing**: 尺配分記載の契約。参照実装の【X分 / 累計 Y:ZZ】が実証フォーマット |
| 3.2 累計と発表時間の整合検証 | なし | **Missing**: review 観点(契約は再利用) |
| 3.3 強調点の記載 | なし(intent は plan 側の意図のみ) | **Missing**: notes 内容要件 |
| 3.4 未確定時の捏造禁止 | slide-quality「Source Materials にない強い断定を追加しない」(一般則) | Extend: 尺への特化(推測時間の記載禁止) |

### 要件 4: 発表コンテキスト入力

| 基準 | 既存資産 | ギャップ |
|------|---------|---------|
| 4.1 イベント名・発表時間の必須確認 | `takt-marp-intake.md` 必須見出しは Goal/Core Message/Audience Context/Output Requirements のみ。normalize-brief も同様 | **Missing**: 必須項目追加 + 未指定明示(明示の置き場 = Non-blocking Notes は既存) |
| 4.2 プロフィール・事実インベントリ収集 | なし | **Missing**: `takt-marp-normalized-brief.md` contract の必須内容への項目追加が自然な拡張点 |
| 4.3 成果物への反映 | なし | **Missing**: compose-slides への反映規約(要件 1.1 の profile class と連動) |
| 4.4 捏造禁止 | slide-quality「入力根拠」節(一般則)が既存 | Extend: イベント名・数値・version への特化 |
| 4.5 欠落の追跡可能性 | normalize の Non-blocking notes 機構が既存 | Extend: 後続 command から参照可能であることの明文化 |

### 要件 5: 先鋭度・密度 review 基準

| 基準 | 既存資産 | ギャップ |
|------|---------|---------|
| 5.1 汎用タイトル検出 | general-slide-quality は 1スライド1メッセージ・最大5 bullet 等の存在/上限基準のみ | **Missing**: 「当該 deck 以外にも当てはまる表現」の判定基準 |
| 5.2 低密度列挙の検出 | なし | **Missing**: bullet→表/カード/コード例への置換可能性の判定基準 |
| 5.3 既存 severity・契約準拠 | blocker/major/minor/info + command-review 契約が既存 | **Constraint**: 新分類・新契約を作らない(再利用必須) |

### 要件 6: 描画の機械的規約

| 基準 | 既存資産 | ギャップ |
|------|---------|---------|
| 6.1 font path・日本語フォント優先 | なし(repo-conventions にも font 記述なし)。参照実装は `@font-face` + `../../node_modules/@fontsource/noto-sans-jp/...` 相対参照 | **Missing** + **Unknown**: canonical font path 規約(後述 Research Needed 1) |
| 6.2 html front matter | repo-conventions の front matter 必須は `marp: true`/`theme`/`paginate` のみ | **Missing**: HTML 要素(inline SVG 含む)使用時の `html: true` 規約。要件 2 と連動 |
| 6.3 規約不適合の検出 | `takt-marp-polish-inspect.md` は render evidence 照合(visual/layout/render/design-token)のみ | **Missing**: font/front matter の機械的規約チェック。compose-review か polish-inspect のどちらに置くかは設計判断 |

**追加発見(stale 記述)**: `knowledge/takt-marp-repo-conventions.md:51` に「`marp.config.mjs` は Kroki を SVG 出力で使う」と記載が残っているが、Kroki は削除済み(現在の `marp.config.mjs` は `allowLocalFiles: true` のみ)。本 spec の機械的整合の範囲で修正するのが自然。

### 要件 7: 既存契約・配布整合

| 基準 | 既存資産 | ギャップ |
|------|---------|---------|
| 7.1 契約不変 | workflow YAML 構造確認済み(§1.3)。facet 本文改訂のみなら YAML 不変 | **Constraint**: 新 policy 追加時も step 構成・rules・report 契約に触れないこと |
| 7.2 template 同期 | sync/check スクリプト + CI 既存(45 ファイル) | なし(全 facet 変更に同期作業が伴うのみ) |
| 7.3 mock smoke 回帰 | `npm run slide:smoke` 既存。mock は facet 内容非依存 | なし(回帰実行のみ) |
| 7.4 既存 deck 非破壊 | — | プロセス制約(実装タスクで `slides/takt-sdd/` を変更しない) |

## 3. 実装アプローチ

### Option A: 既存 facet の拡張のみ

対象 facet(約 11 ファイル)の本文改訂で全要件をカバーし、新規ファイルを作らない。

- ✅ workflow YAML 完全不変 → 要件 7.1 が構造的に保証される
- ✅ template 同期が既存 45 ファイルの内容更新だけで済む
- ❌ `takt-marp-svg-first-visual.md` が「SVG ファースト(別ファイル)」という名前のまま inline 許可を含み、名前と中身が乖離
- ❌ general-slide-quality に先鋭度・密度基準を足すと「このポリシーが扱うこと」境界宣言が肥大化し、policy 間の責務分担(general ↔ slide-quality ↔ svg-first-visual が相互に「扱わないこと」を宣言し合う構造)が崩れやすい

### Option B: 品質次元ごとに新規 policy を追加

尺契約(narrative-notes)、先鋭度・密度(message-sharpness)、inline SVG 規約を新 policy として追加し、workflow YAML の `policies` マップ + 各 step の `policy` 配列に登録。

- ✅ 責務境界が明確。後続 `slide-workflow-visual-review` が参照する語彙単位として綺麗
- ✅ 既存 policy の境界宣言をほぼ触らずに済む
- ❌ workflow YAML 4〜5 ファイル + template 同期対象が増える(新規 facet × 2 箇所)
- ❌ policy 数が 4→6+ に増え、全 step に注入されるコンテキスト量が増加(TAKT 実行時のプロンプト肥大)

### Option C: ハイブリッド(推奨)

既存 facet の本文改訂を基本とし、既存のどの facet の責務境界にも収まらない次元だけ新設を検討する。

| 要件 | 変更先 | 種別 |
|------|--------|------|
| 1.1–1.3 | `takt-marp-design-system.md`(語彙開放+新設規約)、`takt-marp-plan.md` + `takt-marp-slide-plan.md`(enum 開放、二重 enum 解消) | 改訂 |
| 1.4, 2.4, 2.6, 3.2, 5.1, 5.2, 6.3 | `takt-marp-compose-review.md`(観点追加)+ 判定基準を持つ policy | 改訂 |
| 2.1–2.5 | `takt-marp-svg-first-visual.md`(禁止反転+使い分け基準+inline 規約)、`takt-marp-visual-generate.md` | 改訂 |
| 3.1, 3.3, 3.4 | `takt-marp-compose-slides.md`(notes 生成規約)+ 尺契約の置き場(general-slide-quality 拡張 or 新 policy) | 改訂 or 新設 |
| 4.1–4.5 | `takt-marp-intake.md`、`takt-marp-normalize-brief.md`、`takt-marp-normalized-brief.md`、`takt-marp-compose-slides.md` | 改訂 |
| 5.1–5.2 判定基準 | `takt-marp-general-slide-quality.md` の原則表拡張 or 新 policy | 改訂 or 新設 |
| 6.1–6.2 | `takt-marp-slide-quality.md`(front matter/font 規約)、`takt-marp-repo-conventions.md`(stale Kroki 修正含む) | 改訂 |
| 7.2 | `templates/project/facets/**` への `installer:sync-templates` 同期 | 機械的 |

- ✅ YAML 変更を最小化(新 policy を作る場合のみ、policies マップ追記に限定)
- ✅ 名前と中身の乖離・境界宣言の肥大化を、新設判断を設計フェーズに残すことで回避可能
- ❌ 「どれを新設するか」の判断が設計フェーズに残る(本分析では情報提供に留める)

## 4. 工数とリスク

- **工数: M(3–7 日相当)** — 変更はすべて Markdown facet + template 同期でコード変更なし。ただし対象 facet が 10+ で、二重 enum・policy 間境界宣言・template 同期の整合検証面が広い。
- **リスク: Medium** — 機構的リスクは低い(契約/YAML 実質不変、mock smoke は facet 内容非依存)。一方、品質定義の「効果」は mock では検証できず実 provider 実行でしか確かめられない。また policy 間の「扱うこと/扱わないこと」宣言を更新し忘れると矛盾した指示が worker に注入される。

## 5. 設計フェーズへの推奨と Research Needed

### 推奨

1. **Option C(ハイブリッド)を推奨**。新設候補は「尺契約」と「先鋭度・密度基準」の 2 次元に絞り、それぞれ general-slide-quality 拡張で収まるかを設計時に判定する。
2. review 観点の追加はすべて `takt-marp-compose-review.md` の観点リスト + 判定基準を持つ policy のペアで行い、report 契約・severity 分類は一切触らない(要件 5.3 / 7.1 の構造的充足)。
3. layout enum は「基本語彙 enum + 文書化を条件とする拡張許可句」のハイブリッドにし、plan 側 2 ファイルと design-system 側の二重 enum を単一の定義源に寄せる方法を設計する。
4. 参照実装(`slides/takt-sdd/SLIDES.md`)から実証パターン(infographic/code-2col/profile/layers の構造、尺マーカー形式、inline SVG の書き方)を抽出して facet に転写する際、**deck 固有値(色・文言)と再利用可能パターンを分離**すること。
5. stale な Kroki 記述(repo-conventions)は要件 6 の機械的整合の一部として本 spec で修正する。

### Research Needed(設計フェーズで解決)

1. **font path の canonical 規約**: 参照実装の `../../node_modules/@fontsource/noto-sans-jp/...` は repo-local 前提。global install された target project での解決可能性(target に `@fontsource` が無い場合の挙動、システムフォント fallback の十分性)を設計時に確認し、「解決可能な path + fallback スタック」の規約文面を決める。brief は repo-local 参照の解消自体を out of scope としているため、規約の要求水準(必須 or 推奨+fallback)の線引きが論点。
2. **layout enum 開放の具体構文**: 完全自由化すると 1.4 の review 照合(plan Layout ↔ style 定義存在)が唯一の安全網になる。enum 維持+拡張句 vs 完全自由化のトレードオフ。
3. **新 layout class の文書化先**: deck-local `design-system.md` のみで review/fix が識別可能か、facet 側に実証パターン集(knowledge)を持つか。knowledge 化は後続 visual-review でも再利用できる利点がある。
4. **尺マーカーのフォーマット拘束度**: 【X分 / 累計 Y:ZZ】を canonical 形式として固定するか、内容要件(所要+累計+強調点)のみ規定するか。review の判定しやすさはフォーマット固定が有利。
5. **6.3 の検出位置**: font/front matter 規約チェックを compose-review(source レベルで早期検出)と polish-inspect(render evidence と併せて検出)のどちらに置くか、両方か。

---

# 設計ディスカバリー追記(design フェーズ)

- 追記日: 2026-06-11
- ディスカバリー範囲: 拡張(light discovery)
- 注記: core steering(`product.md` / `tech.md` / `structure.md`)は存在せず `roadmap.md` のみ。プロジェクト文脈は roadmap と本 research に依拠する。

## 調査ログ

### brief.md テンプレートの所在と既存構造
- **背景**: 要件 4.1/4.2 の入力収集をどこに足すかの確定。
- **参照した情報源**: `docs/marp-slide-workflow.md`(brief.md テンプレート節)、`.takt/facets/instructions/takt-marp-intake.md`
- **発見**: brief テンプレートは `docs/marp-slide-workflow.md` にあり、既に `## Event`(Name/Date/Duration/Venue/Audience)を**任意項目**として持つ。`Speaker Profile` と `Fact Inventory` に相当する見出しはない。intake の hard-block 必須見出しは Goal/Core Message/Audience Context/Output Requirements の 4 つ。
- **含意**: 4.1 は「必須項目として確認し、欠落は明示」であり presence 必須ではない。intake の hard-block 集合は変更不要(→ 7.1 の状態遷移不変が保てる)。確認・明示の責務は normalize-brief に置く。テンプレートには `## Speaker Profile` と `## Fact Inventory` を追加する。

### smoke validator の検査範囲
- **背景**: contract のセクション追加が要件 7.3(mock smoke 成功)を壊さないかの確認。
- **参照した情報源**: `scripts/takt-marp-validate-slide-workflow-smoke.mjs`
- **発見**: smoke は artifact の存在・report front matter・`plan.md` の `deliverables: [...]` 行のみを検査する。`brief.normalized.md` は合成固定文字列(`# Normalized Brief...`)を自前で書き込み、本文セクション構造は検証しない。
- **含意**: normalized-brief / slide-plan contract への本文セクション追加・Layout 語彙変更は smoke に影響しない。`deliverables:` 行と report front matter schema に触れないことだけが制約。

### knowledge facet の配線
- **背景**: layout 語彙の単一定義源を plan / compose 両 workflow から参照できる場所の確定。
- **参照した情報源**: `.takt/workflows/takt-marp-slide-plan.yaml`、`.takt/workflows/takt-marp-slide-compose.yaml`
- **発見**: `takt-marp-repo-conventions`(knowledge)は plan / compose 両 workflow の**全 step** に `knowledge:` として注入済み。新規 knowledge ファイルの追加は YAML 変更を要するが、既存 repo-conventions の拡張なら YAML 不変。
- **含意**: layout 基本語彙表は repo-conventions に置けば、plan 時点(deck-local `design-system.md` がまだ存在しない)でも compose 時点でも同一定義を参照できる。

### 参照実装の機械的規約の実態
- **発見**: `slides/takt-sdd/SLIDES.md` は front matter `html: true`、`@font-face` で `../../node_modules/@fontsource/noto-sans-jp/...`(repo-local 相対 path)、フォールバックスタック `"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif` を使用。global install 先の target project には `node_modules` が存在しないため、この @font-face path は解決不能になる。
- **含意**: font 規約は「システムフォント込みのスタック必須 + @font-face は path 実在確認できる場合のみ任意」の 2 層にする。

## 設計判断

### 判断 D1: layout 語彙の単一定義源は repo-conventions(knowledge)
- **背景**: Research Needed 2・3。enum が 4 箇所(docs、plan instruction、slide-plan contract、design-system instruction)に重複し既に不整合。plan 時点では deck-local design-system.md が存在しない。
- **検討した代替案**:
  1. 新規 knowledge facet(layout-patterns)— YAML 5 ファイル変更+TAKT の step knowledge 複数指定可否が未確認
  2. design-system instruction を正本に — plan workflow から参照不可(instruction は step 単位)
  3. 各所の enum をロックステップ更新 — drift 再発が必至
- **採用したアプローチ**: `takt-marp-repo-conventions.md`(全 step 注入済み)に基本語彙表(class 名+用途 1 行+構造ヒント)と modifier 区分を置き、plan instruction / slide-plan contract / design-system instruction は「基本語彙+`custom:` 拡張句」でこれを参照する。docs の enum 節は人間向けに同期更新。
- **根拠**: YAML 不変(7.1 構造的充足)、両 workflow から参照可能、既存配線の再利用。
- **トレードオフ**: repo-conventions が肥大する(現 78 行 → 100 行強)。knowledge は全 step に入るためプロンプト量が微増。
- **フォローアップ**: 実装時に 4 箇所の旧 enum を漏れなく置換すること(grep で検証)。

### 判断 D2: inline SVG は「許可+規約」に反転、使い分け基準を明文化
- **背景**: 要件 2。現 policy は禁止事項に明記。参照実装は 8 箇所で使用。
- **採用したアプローチ**: `takt-marp-svg-first-visual.md` の禁止行を削除し、「外部 SVG ファイル vs inline SVG の使い分け基準」節と「inline SVG 規約」節(フォントスタック、スライド領域内 containment、長文禁止の既存規則適用)を追加。`visual-generate` instruction を両形式対応に改訂。policy 名・ファイル名は不変(SVG-first = ラスターより SVG 優先、の意味は維持)。
- **根拠**: ファイル名変更は YAML 5 ファイル+templates に波及するため不変が安全。
- **トレードオフ**: policy 名と内容の意味範囲が広がるが、冒頭の原則表で吸収可能。

### 判断 D3: 尺契約・先鋭度・密度は general-slide-quality 拡張(新 policy なし)
- **背景**: Research Needed 4 と gap 分析 Option C の新設判断。
- **検討した代替案**: 新 policy(narrative-notes / message-sharpness)— YAML の policies 追記が必要、policy 数 4→6。
- **採用したアプローチ**: `takt-marp-general-slide-quality.md` の責務宣言(「情報密度」「話しやすさ」)に収まるため、同 policy に「Speaker Notes 尺契約」節と「先鋭度・密度基準」節を追加。尺マーカーは canonical format を固定: notes 冒頭行 `【N分 / 累計 M:SS】`(参照実装で 16 箇所実証済み)。発表時間が brief に無い場合はマーカー自体を書かない(3.4)。
- **根拠**: 既存責務宣言と意味的に整合し YAML 不変。format 固定により review の整合判定(3.2)が機械的に可能。
- **トレードオフ**: policy が約 45 行 → 約 80 行に伸びる。許容範囲。

### 判断 D4: font 規約は「スタック必須+@font-face 条件付き任意」の 2 層
- **背景**: Research Needed 1。global install 先に node_modules が無い。repo-local 参照解消は out of scope。
- **採用したアプローチ**: (1) 日本語優先フォールバックスタック(`"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif` 相当)を必須、(2) `@font-face` は宣言する場合のみ「`SLIDES.md` からの相対 path が実在すること」を条件とする。compose は path 実在を確認してから宣言し、review は解決不能 path を finding にする。
- **根拠**: 「解決可能な font path」(6.1)を検査可能な性質に落とし込み、portability 問題の解決(out of scope)を要求しない。
- **トレードオフ**: @font-face 無し環境では描画フォントが OS 依存になるが、フォールバックスタックで日本語描画は保証される。

### 判断 D5: 機械的規約(6.3)の一次検出は compose-review、polish-inspect は不変
- **背景**: Research Needed 5。
- **採用したアプローチ**: font path 実在・`html: true` の有無は `SLIDES.md` の静的検査で判定できるため compose-review の観点に追加する。polish-inspect は既存の render/design-token 観点のままとし変更しない。
- **根拠**: source レベルの早期検出が fix ループのコストを最小化する。要件 6.3 は「review または検証」であり compose-review で充足。変更ファイル数も減る。

### 判断 D6: 発表コンテキストは normalize-brief 確認+contract セクション追加、intake 不変
- **背景**: 要件 4。intake の hard-block を増やすと plan command の成功条件が変わる(7.1 抵触リスク)。
- **採用したアプローチ**: intake は不変。normalize-brief instruction に「イベント名・発表時間の確認必須(欠落は未指定と明示)」「登壇者プロフィール・事実インベントリの推奨収集」を追加。`takt-marp-normalized-brief.md` contract の必須内容に `Event Context` / `Speaker Profile` / `Fact Inventory` を追加(欠落時は「未指定」と記載して節自体は必須)。brief テンプレート(docs)に `## Speaker Profile` / `## Fact Inventory` を追加。compose-slides に title/profile スライドへの反映規約を追加。捏造禁止(4.4)は slide-quality「入力根拠」節へイベント名・数値・version の特化文を追記。
- **根拠**: 「確認必須・presence 任意」の要件文言に合致し、状態遷移・成功条件が不変。
- **フォローアップ**: 節必須化により mock 合成 normalized brief との差異が生じるが、smoke は本文構造を検証しないことを確認済み(調査ログ参照)。

### 統合(synthesis)の結論
- **一般化**: 「review 観点の追加」(1.4 / 2.4 / 2.6 / 3.2 / 5.1 / 5.2 / 6.3)は全て「policy に判定基準、compose-review に観点、既存 severity と report 契約で報告」という同一パターンに正規化した。新しい報告経路は作らない。
- **build vs adopt**: 新規機構はゼロ。既存の facet 注入、review⇄fix ループ、template 同期、smoke をすべて流用する。
- **単純化**: 新規ファイルは作らない(候補だった新 policy 2 件・新 knowledge 1 件をすべて既存 facet 拡張に吸収)。YAML・scripts・report schema に触れない。変更は facet 12 ファイル+docs 1 ファイル+templates 同期に閉じる。

## リスクと緩和策

- **facet 間の責務宣言の矛盾** — general-slide-quality / slide-quality / svg-first-visual は相互に「扱わないこと」を宣言し合う。改訂時に 3 ファイルの境界宣言を同時に見直すタスクを設ける。
- **品質定義の効果が mock で検証不能** — smoke は構造のみ検証。効果検証は実 provider 実行が必要であり、本 spec では facet 文面の静的整合(参照実装との突合)までを保証範囲とする。実行時の視覚品質判定は後続 `slide-workflow-visual-review` が所有。
- **enum 置換漏れ** — 旧 enum が 4 箇所に分散。実装後に `grep -rn 'split-40-60' --include='*.md'` 等で全箇所の整合を機械確認する。
- **template drift** — facet 変更ごとに `installer:sync-templates` → `installer:check-templates` を実行。CI でも強制される。
