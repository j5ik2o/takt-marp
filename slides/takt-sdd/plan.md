# Slide Plan

## Deck Summary
- Title: TAKTでAI開発を制御する
- Subtitle: takt-sddに見る cc-sdd v3品質ゲート設計
- Audience: TAKTについて学ぶ勉強会の参加者。AIエージェントやcc-sdd/Kiro-style SDDの概念には触れているが、AI開発をworkflow・contract・gateとして制御する設計はまだ十分に理解していない開発者・メンテナ。
- Duration: 28分（12:30-12:58 / Online）。9スライド。cc-sdd v3のおさらいは2分以内に抑え、山場のスライド8に4.5分前後を寄せる。
- Time allocation guide: slide 1=1.5分、slide 2=2分以内、slide 3-7=各3分前後、slide 8=4.5分前後、slide 9=2分前後。
- Core message: TAKTはAIの出力そのものを決定論化するのではなく、実行経路・分岐・証跡・完了判定を決定論化する。takt-sddはその設計で cc-sdd v3 を品質ゲート付きの開発プロセスにしている。
- Narrative arc: cc-sdd v3 / Kiro-style SDDの基本 → AIエージェント利用だけでは品質保証にならない現状 → TAKTが制御する対象 → facet/contract/ruleの構造 → 状態変更とread-only validationの分離 → AI品質ゲートの閉じたループ → `kiro-impl`に見る高度制御 → TAKT設計パターンとしての持ち帰り。
- deliverables: [html, pdf]

## Requested Deliverables
deliverables: [html, pdf]

（PPTX は brief の Deliverables に含まれないため対象外。後段 deliver は html と pdf のみ生成・検証する。）

## Visual Plan
- 使用する SVG はちょうど3点。未使用プレースホルダは作らない。
- SVG 1 = `images/cc-sdd-v3-flow.svg`（スライド2）: `kiro-discovery` → `kiro-spec-init` → `kiro-spec-requirements` → `kiro-spec-design` → `kiro-validate-design` → `kiro-spec-tasks` → `kiro-impl` → `kiro-validate-impl` のKiro-style SDD基本フローを示す。1図 = 「cc-sdd v3は discovery から final validation へ進むプロセス」。
- SVG 2 = `images/takt-anatomy.svg`（スライド4）: Kiro skill intent / cc-sdd v3 を入力に、TAKT の `workflow YAML`、`steps + rules`、`facets`、`output contracts`、`loop_monitors`、`workflow_call` が実行経路・分岐・証跡を制御し、`.kiro/specs` artifacts と validation/review evidence へ到達する構造を示す。1図 = 「TAKTはAI出力ではなく実行制御面を決定論化する」。
- SVG 3 = `images/impl-control-stack.svg`（スライド8）: `kiro-impl.yaml` の高度制御例として、`plan-one-task`、`execute-task`、`workflow_call: kiro-ai-quality-gate.yaml`、parallel reviewers（coding / architecture / QA / testing）、`loop_monitors`、completion verification、final `validate-impl` を1枚で見せる。1図 = 「TAKTはsubworkflow・並列review・loop監視・read-only verifyを組み合わせられる」。
- SVG 共通制約は `docs/marp-slide-workflow.md` の Visual 方針に従う（viewBox 0 0 1100 540、強調色1-2色、本文を詰め込まない、Marp 上で読める）。

## Sections
1. 導入（スライド1）: TAKTでAI開発を制御する、という主張を固定する。
2. おさらい（スライド2）: cc-sdd v3 / Kiro-style SDD の基本を短く揃える。
3. 問題（スライド3）: AIエージェント1回実行では品質保証にならない。
4. TAKT anatomy（スライド4）: workflow/facet/contract/rule/loop/workflow_call が何を制御するか。
5. TAKTの安定化ポイント（スライド5-7）: prompt分解、machine-readable state、生成/検証の責務分離、AI gateの閉じた修正ループ。
6. 山場（スライド8）: `kiro-impl` に見る workflow_call + parallel + loop monitors + verify。
7. 着地（スライド9）: takt-sddから学べるTAKT設計パターンと、cc-sdd制御による工数削減・品質向上。

## Slides

### 1. Title — TAKTでAI開発を制御する
- Message: TAKTはAIの回答を信じるための道具ではなく、AI開発の実行経路・分岐・証跡・完了判定を設計するためのworkflow基盤である。
- Layout: single
  - 理由: タイトルと中心メッセージを強く提示する導入。図や比較は不要なので1列。
- Content:
  - メインタイトル: `TAKTでAI開発を制御する`
  - サブタイトル: `takt-sddに見る cc-sdd v3品質ゲート設計`
  - 今日の主張: TAKTはAI出力そのものではなく、実行経路・分岐・証跡・完了判定を決定論化する
  - takt-sddは、AIエージェントによる開発を閉じた品質ループへ載せる具体例
- Visual: none
- Speaker note intent: TAKT勉強会として、takt-sddの紹介だけでなくTAKT workflow設計の実例として話すことを宣言する。冒頭で、AIを賢くする話ではなく、AI開発を制御する話だと線を引く。次スライドでcc-sdd v3の基本をおさらいしてから、なぜAIエージェント利用だけでは危ないのかへ進む。
- Source: brief.md（Goal / Core Message / Audience Context）/ takt-sdd README.md（TAKT state-machine workflow control / pinned `cc-sdd@3.0.2` / Kiro Compatibility Workflow）/ CC-SDD-CODEX.md / package.json（canonical `kiro:*` surface）

### 2. cc-sdd v3のおさらい
- Message: cc-sdd v3はKiro-style SDDをspec artifact中心に進める前提であり、takt-sddはそこにTAKTの制御を重ねる。
- Layout: visual-full
  - 理由: 以降のTAKT制御を理解するための前提を、文章ではなく基本フローの図として渡す。
- Content:
  - SVG 1 のキャプション: cc-sdd v3/Kiro-style SDD は discovery から spec生成・design validation・tasks・impl・final validation へ進む
  - 図の流れ: `kiro-discovery` → `kiro-spec-init` → `kiro-spec-requirements` → `kiro-spec-design` → `kiro-validate-design` → `kiro-spec-tasks` → `kiro-impl` → `kiro-validate-impl`
- Visual: svg: images/cc-sdd-v3-flow.svg
- Speaker note intent: cc-sddそのものの一般紹介には寄せすぎず、以降のTAKT制御を理解するための前提だけを置く。v3対応ではKiro-compatibleなspec artifactとkiro:* surfaceを前提にし、kiro-discovery → kiro-spec-init → kiro-spec-requirements → kiro-spec-design → kiro-validate-design → kiro-spec-tasks → kiro-impl → kiro-validate-impl の流れを扱う。takt-sddはpinned `cc-sdd@3.0.2` 初期化を含め、その流れをTAKT workflowで制御対象にしている、と説明する。次スライドで、なぜこの流れをAIエージェントに任せきりにすると危ういのかへ進む。
- Source: takt-sdd README.md（pinned `cc-sdd@3.0.2` / Kiro Compatibility Workflow / Artifacts from each phase）/ CC-SDD-CODEX.md（Specs path / Minimal Workflow）/ package.json（canonical `kiro:*` surface）

### 3. 問題 — AIエージェント1回実行では品質保証にならない
- Message: AIエージェントを1回走らせるだけでは、受入条件未達・レビュー漏れ・脆弱性・本番障害を止める品質保証にならない。
- Layout: single
  - 理由: 問題意識を強く共有するスライド。単純なリスク列挙と結論で十分なので1列。
- Content:
  - AIは成果物を出せるが、毎回同じ経路で進むとは限らない
  - 受入条件未達やレビュー漏れが、人間レビューを素通りすることがある
  - 脆弱性や本番障害につながる変更も、1回の回答採用では止めにくい
  - 問題が出たら、検出・修正・再検証の閉じたループで扱う必要がある
  - TAKTはここを state machine と gate で制御する
- Visual: none
- Speaker note intent: 問題はAIが間違えること自体ではなく、間違えたときに検出・修正・再検証する閉じたループが設計されていないことだと説明する。本来は必要な回数だけ検出→修正→再検証を回すべきだが、AIエージェント利用では開発者が1回の回答を採用しがちである、という現状認識を話す。次にTAKTが何を制御しているのかを図で見せる。
- Source: brief.normalized.md（Required Topics #1 / AI quality gate / Implementation quality gate）/ takt-sdd README.md（Multi-stage Validation / Loop Detection）

### 4. TAKT anatomy — 何を決定論化しているのか
- Message: TAKTはAI出力を決定論化するのではなく、step、rule、facet、contract、loop、subworkflowで実行制御面を決定論化する。
- Layout: visual-full
  - 理由: TAKTの構成要素を1枚の地図として渡す山場前の基礎図。本文は見出しと短いキャプションに絞り、SVGを最大化する。
- Content:
  - 見出し = Message を1行
  - SVG 2 のキャプション: TAKTはKiro/cc-sddの意図をworkflow・facets・contracts・loopで制御し、spec artifactsとevidenceへ落とす
  - 詳細な制御パターンはスライド5-8で掘り下げる
- Visual: svg: images/takt-anatomy.svg
- Speaker note intent: TAKTは「AIの回答を固定する」ものではなく、「どのstepを、どの条件で、どの証跡をもって次へ進めるか」を固定するものだと説明する。takt-sddはcc-sdd v3/Kiro-style SDDをこの構造に乗せた実例であり、Kiro-compatible workflowをTAKTのworkflow・facet・contract・gateとして制御している。次スライドでfacetとoutput contractを深掘りする。
- Source: takt-sdd README.md（Declarative Workflow Control / Faceted Prompting）/ `.takt/en/workflows/kiro-impl.yaml` / `.takt/en/workflows/kiro-ai-quality-gate.yaml` / `.kiro/specs/kiro-shared-workflow-contracts/`

### 5. Facets + Output Contracts — promptを分解し、状態を機械可読にする
- Message: Facet分離とoutput contractにより、promptを保守可能にし、TAKT ruleが読める machine-readable state を作れる。
- Layout: single
  - 理由: TAKTの設計要素を分類して説明する。比較よりも構造化リストが向いているため1列。
- Content:
  - Facets: `Persona / Policy / Instruction / Knowledge / Output Contract` を分ける
  - Output contracts: `STATUS`、`DECISION`、`VERDICT`、finding count、evidence を後続ruleが読める形にする
  - Rules: 自由文の印象ではなく、machine field と条件で次stepを決める
  - `kiro:*` surface は、この構造を外から呼ぶ安定した入口
- Visual: none
- Speaker note intent: promptを1つの巨大文書にせず、役割・制約・手順・知識・出力契約に分けることがTAKTの強みだと説明する。特にoutput contractがないと、次の分岐がAIの自由文解釈になってしまう。`kiro:*`は主役ではなく、この制御構造への安定した入口として扱う。
- Source: takt-sdd README.md（Faceted Prompting）/ `.kiro/specs/kiro-shared-workflow-contracts/design.md` / CC-SDD-CODEX.md / package.json（canonical `kiro:*` surface）

### 6. State-changing workflow vs read-only validation
- Message: 状態を変える生成workflowと、状態を変えず判定するread-only validationを分けることで、成功扱いの根拠を明確にする。
- Layout: compare-2col
  - 理由: 「作るstep」と「判定するgate」を左右に分けると、TAKTの責務境界が一目で伝わる。左右対等な比較なので2列。
- Content:
  - 左（state-changing / 生成）: `kiro-spec-init`、`kiro-spec-requirements`、`kiro-spec-design`、`kiro-spec-tasks`、`kiro-spec-quick`
  - 右（read-only / 判定）: `kiro-spec-status`、`kiro-validate-gap`、`kiro-validate-design`、`kiro-validate-impl`
  - validation は artifact を勝手に直さず、GO/NO-GO、不足証跡、manual check を返す
  - 検証不能な項目を成功扱いにしない
- Visual: none
- Speaker note intent: AI workflowでは、生成と検証を同じstepに混ぜると「作った本人が通した」状態になりやすい。TAKTでは状態変更するworkflowとread-only gateを分け、validationが成功の根拠を明示する。次スライドでは、問題を見つけたときの閉じた修正ループを見る。
- Source: `.kiro/specs/kiro-spec-generation-workflows/` / `.kiro/specs/kiro-status-validation-workflows/` / `.takt/en/workflows/kiro-validate-design.yaml` / `.takt/en/workflows/kiro-validate-impl.yaml`

### 7. AI quality gate — 閉じた修正ループを設計する
- Message: AI quality gateは問題を見つけるだけでなく、`review -> fix -> review` と `need_replan` の分岐で次の状態を決める。
- Layout: single
  - 理由: ここは検出リストではなく、閉じたループと分岐条件を見せるスライド。簡潔な擬似フローと補助リストで1列に収める。
- Content:
  - `No AI-specific issues` → `COMPLETE`
  - `AI-specific issues found` → `fix` → `review` に戻る
  - ambiguous / blocked / internally inconsistent → `need_replan`
  - `loop_monitors.threshold` 到達 → `need_replan`
  - 検出例: hallucinated path/API、scope mismatch、unsupported claim、unused artifact
- Visual: none
- Speaker note intent: AI gateの本質は、検出項目の多さではなく、問題が出たときに閉じたループで修正し、未収束なら安全にreplanへ戻すことだと説明する。これは「1回の回答を採用する」使い方との決定的な違いである。次スライドが山場であり、このgateをsubworkflowとして組み込んだ実装制御を見せる。
- Source: `.takt/en/workflows/kiro-ai-quality-gate.yaml` / `.kiro/specs/kiro-ai-quality-gate/` / `.kiro/specs/kiro-ai-quality-gate-workflow-coverage/`

### 8. `kiro-impl` — workflow_call + parallel + loop monitors + verify
- Message: TAKTは単線の手順書ではなく、subworkflow・並列review・loop監視・最終検証を組み合わせてAI開発を制御できる。
- Layout: visual-full
  - 理由: `kiro-impl` の高度制御例が発表の山場。要素が多いため、本文は短いキャプションに絞り、SVGで構造を見せる。
- Content:
  - 見出し = Message を1行
  - SVG 3 のキャプション: `kiro-impl`は実装step、AI quality gate、並列review、loop監視、final validateを1つの制御スタックにする
  - `loop_monitors` が execute/debug/review の未収束ループを監視
  - reviewer は coding / architecture / QA / testing の4観点。security専用gateとは言わない
- Visual: svg: images/impl-control-stack.svg
- Speaker note intent: ここを発表の山場として扱う。`kiro-impl`はTAKTの高度な制御例として見せる。AI gateを内部subworkflowとして呼び、4観点reviewをparallelで走らせ、未収束ループをmonitorし、最後にcompletion verificationとread-only validateで完了判定する。ここでTAKTが「手順の自動化」ではなく「品質制御の合成」であることを強調する。
- Source: `.takt/en/workflows/kiro-impl.yaml` / `.takt/en/workflows/kiro-ai-quality-gate.yaml` / `.takt/en/workflows/kiro-validate-impl.yaml` / `.kiro/specs/kiro-iterative-implementation-workflow/`

### 9. 持ち帰り — takt-sddから学べるTAKT設計パターン
- Message: takt-sddが示しているのは、AI開発をpromptではなくworkflow・contract・gateとして設計するパターンである。
- Layout: single
  - 理由: 最後は具体例から設計パターンへ抽象化して締める。図は不要で、短い持ち帰りリストにする。
- Content:
  - AI作業を `step + rule + contract` に分解する
  - 状態変更workflowとread-only validationを分ける
  - AI gateは検出だけでなく `fix / replan` の分岐を持つ
  - `parallel review` と `loop monitor` でレビュー漏れ・未収束を抑える
  - cc-sdd v3をこの形で包むことで、工数削減と品質向上を同時に狙える
- Visual: none
- Speaker note intent: TAKTの設計パターンとして何を持ち帰るべきかを整理する。takt-sddは単なるcc-sddラッパーではなく、AI開発を閉じた品質ループとして運用する具体例である。CLI導線は主題にせず、今日の価値はすでに実体化している品質制御にあると述べる。最後に「TAKTでAI開発を制御する」というタイトルへ戻して締める。
- Source: takt-sdd README.md / package.json（canonical `kiro:*` surface）/ `.kiro/specs/*/spec.json`（major specs の readiness）/ brief.md（Optional Topics）

## Appendix
- 計画しない。28分 / 9スライドで本編が収まり、TAKT勉強会としても本編に集中した方がよい。

## Non-blocking human review points
- 脆弱性はスライド3のリスク例として扱う。`kiro-impl` にsecurity専用gateがあるとは言わない。
- スライド9の「すでに実体化している品質制御」は、workflow YAML と package.json の `kiro:*` surface を根拠に話す。`spec.json` の `ready_for_implementation` は補足根拠であり、「全タスク実装完了」とは言わない。
- Source Materials の具体引用は compose/write step で実ファイルを直接読み、事実主張に紐付ける。
- SVG 3点の図要素（ノード名・分岐）は対応 workflow YAML / spec の実体に合わせて compose 時に確定する。

## Blocking issues
- なし。TAKT勉強会向けに、中心メッセージ、章構成、Deliverables、Visual scope を更新した。
