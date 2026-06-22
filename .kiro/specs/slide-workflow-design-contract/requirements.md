# 要件定義

## はじめに

`slide-workflow-design-contract` は、Claude Design Source（Claude Designソース）を唯一の user-facing design system 入力として取り込み、Design Contract（デザイン契約）を workflow 内部の normalized artifact として扱うための spec です。

利用者は `slides/<deck>/design/design-brief.md` を Claude Design に渡す authoring input として作成し、Claude Design で作った Design System を `.zip` として export し、deck の design 入力として配置します。`plan` と `compose` は同じ Resolved Design Contract（解決済みデザイン契約）を読み、`plan` は CSS を生成せずに layout / visual / density の制約を計画へ反映し、`compose` はその契約から CSS、`_class`、section HTML/CSS、visual source を生成します。

## 境界コンテキスト

- **対象範囲**: Design Brief（デザインブリーフ）による Claude Design authoring input の固定、Claude Design zip の解決、manifest / token CSS / adherence metadata の import、Resolved Design Contract の生成と handoff、`plan` / `compose` の fingerprint 照合、`design-system.md` の canonical artifact からの除外、review / smoke / package / no-copy validation の更新。
- **対象外**: 手書き `design-contract.md`、package 側の default design input、deck-local Markdown override、PDF / PPTX / standalone HTML export の primary import、Claude Design `/design-sync` の repo 更新形式、新しい top-level `design` command、`plan` による CSS 生成、consumer workspace への `.takt/workflows` / `.takt/facets` 自動コピー。
- **隣接システム／スペックへの期待**: `slide-workflow-orchestration` は `plan / compose` の command/state/report foundation を提供する。`slide-workflow-quality-uplift` は layout vocabulary、visual component、review severity の品質基準を提供する。`takt-marp-global-installer` は package-bundled template と no-copy 実行経路を提供する。`slide-workflow-smoke-validation` は Claude Design Source import と compose 適用を end-to-end に検証する。

## 要件

### 要件 1: Claude Design Source を一意に解決する

**目的:** deck 作成者として、Claude Design で作った Design System をそのまま workflow のデザイン入力にしたい。そうすることで、Markdown のデザイン仕様を毎回読んで判断しなくて済む

#### 受け入れ基準

1.1. 利用者が `plan` または `compose` を実行したとき、slide workflow は target deck の `slides/<deck>/design/` から `_ds_manifest.json` を含む Claude Design zip を一意に解決しなければならない。

1.2. `slides/<deck>/design/` に Claude Design zip が存在しない場合、slide workflow は `plan` または `compose` を成功扱いせず、`CLAUDE_DESIGN_SOURCE_MISSING` と確認すべき配置先を表示しなければならない。

1.3. `slides/<deck>/design/` に Claude Design zip 候補が複数存在する場合、slide workflow は任意の 1 件を選ばず、`CLAUDE_DESIGN_SOURCE_AMBIGUOUS` と候補一覧を表示しなければならない。

1.4. Claude Design Source が unreadable zip、malformed zip、または `_ds_manifest.json` を含まない zip である場合、slide workflow は成果物を成功扱いせず、利用者が source file と原因を特定できる失敗情報を残さなければならない。

1.5. `plan` または `compose` が design input を解決するとき、slide workflow は `design-system.md`、手書き `design-contract.md`、または package-bundled default を Claude Design Source の代替として扱ってはならない。

1.6. `slides/<deck>/design/` に valid な Claude Design zip と invalid な `.zip` が同居する場合、slide workflow は valid な 1 件を暗黙採用せず、`CLAUDE_DESIGN_SOURCE_INVALID` と invalid / valid 候補の情報を表示しなければならない。

### 要件 2: Claude Design zip を Design Contract へ正規化する

**目的:** maintainer と deck 作成者として、Claude Design export の token 情報を workflow が安定して読める内部契約に変換したい

#### 受け入れ基準

2.1. Claude Design Source が解決されたとき、slide workflow は `_ds_manifest.json`、`styles.css`、`tokens/colors.css`、`tokens/typography.css`、`tokens/spacing.css` を必須 input として検証しなければならない。

2.2. Claude Design Source に `.thumbnail`、`_ds_bundle.js`、`_adherence.oxlintrc.json`、`tokens/fonts.css`、`SKILL.md`、`readme.md` / `README.md`、`components/**/*.prompt.md`、`guidelines/*.card.html`、`slides/*.html`、`templates/**/*.dc.html`、または `assets/*` が含まれる場合、slide workflow はそれらを optional metadata、guidance、source catalog として取り込み、存在しないことだけを理由に import を失敗させてはならない。

2.3. `_ds_manifest.json` が JSON object ではない場合、`namespace`、`globalCssPaths`、`tokens` を欠く場合、`namespace` が空でない string ではない場合、または `globalCssPaths` / `tokens` が array ではない場合、slide workflow は Resolved Design Contract を生成せず、`CLAUDE_DESIGN_SOURCE_INVALID` と原因または不足 field を表示しなければならない。

2.4. manifest の token list が空の場合、slide workflow は Resolved Design Contract を生成せず、token が空であることを利用者が確認できる失敗情報を残さなければならない。

2.5. manifest token と token CSS の custom property が一致しない場合、slide workflow は import を成功扱いせず、差分の概要を report しなければならない。

2.6. `components`、`startingPoints`、`cards`、`templates`、`themes`、または `fonts` が空配列である場合でも、slide workflow は token が有効であれば Claude Design Source を valid として扱わなければならない。これらが非空の場合、slide workflow は特定ドメインに固定せず、name/path/description などの汎用 catalog として Resolved Design Contract に記録しなければならない。

2.7. slide workflow が token category を分類するとき、manifest の `kind` だけに依存せず、token name prefix と source CSS path も使って colors / typography / spacing / radius / shadow / font を分類しなければならない。

2.8. manifest の `brandFonts` が string 配列または `family` を持つ object 配列である場合、slide workflow は引用符あり / なしの CSS font-family token から抽出した font family と合わせて、重複を除いた `brand_fonts` として Resolved Design Contract に記録しなければならない。

### 要件 3: Resolved Design Contract を workflow に引き渡す

**目的:** workflow 利用者として、`plan` と `compose` が同じデザイン入力を使ったことを検証可能にしたい

#### 受け入れ基準

3.1. Claude Design Source の import が成功したとき、slide workflow は Resolved Design Contract を `.takt/` 配下の workflow-managed artifact として保存しなければならない。

3.2. Resolved Design Contract が保存されたとき、slide workflow は source path、source fingerprint、manifest namespace、token counts、brand fonts、component count、adherence metadata の有無、`guidance`、`source_catalog` を記録しなければならない。

3.3. `plan` または `compose` が実行されるとき、slide workflow は `.takt/workflow-current-target.json` に Resolved Design Contract の path と fingerprint を記録しなければならない。

3.4. Resolved Design Contract の生成に失敗した場合、slide workflow は古い Resolved Design Contract を fallback として使ってはならない。

3.5. `research` artifacts が存在する場合でも、slide workflow は Claude Design Source metadata を research metadata と別 field に記録し、Plan Optional Context と混同してはならない。

3.6. `plan` または `compose` を `--force` で再実行する場合、slide workflow は既存成果物の archive / clean より前に Claude Design Source を import / validation しなければならない。ただし Resolved Design Contract の保存は archive / clean が成功した後に行い、archive / clean が失敗した場合は旧成果物と旧 Resolved Design Contract を不整合な状態にしてはならない。

3.7. `plan` または `compose` を rejected supervision から `--force` なしで再実行する場合、slide workflow は rejected artifact の archive より前に Claude Design Source を import / validation し、validation 失敗時は既存 supervision / approval / review history を変更してはならない。

3.8. `polish`、`deliver`、`research` など新しい Design Contract を生成しない command が marker を作るとき、既存 `.takt/workflow-current-target.json` が malformed でも停止せず読み捨て、保存済み Resolved Design Contract marker または `null` へフォールバックしなければならない。

3.9. `polish`、`deliver`、`research` など新しい Design Contract を生成しない command が marker を作るとき、既存 marker の target が一致しても `design_contract.path` が存在しない場合、slide workflow は stale な Design Contract marker を引き継がず、保存済み Resolved Design Contract marker または `null` へフォールバックしなければならない。

3.10. `polish`、`deliver`、`research` など新しい Design Contract を生成しない command が marker を作るとき、保存済み Resolved Design Contract が malformed JSON または marker payload を作れない shape の場合、slide workflow は停止せず `design_contract` を省略して Legacy Polish Path へフォールバックしなければならない。

3.11. `polish`、`deliver`、`research` など新しい Design Contract を生成しない command が marker を作るとき、既存 marker の target が一致し `design_contract.path` が存在する場合でも、その path の Resolved Design Contract が malformed JSON または marker payload を作れない shape であれば、slide workflow は既存 marker の `design_contract` を再利用してはならない。

3.12. Resolved Design Contract から marker payload を作る場合、slide workflow は `source.path`、`source.sha256`、`source.namespace`、`fingerprint.source_sha256`、`fingerprint.contract_sha256` を必須 field として扱い、欠けている場合は valid な Design Contract marker として扱ってはならない。

3.13. 保存済み Resolved Design Contract から marker payload を作る場合、slide workflow は `fingerprint.contract_sha256` を再計算し、保存済み値と一致しない場合は valid な Design Contract marker として扱ってはならない。

### 要件 4: plan は Design Contract を使って実現可能な構成を計画する

**目的:** deck 作成者として、`compose` が実現できる layout と visual だけを `plan` に出してほしい。そうすることで、後続工程で style 不一致による手戻りを減らせる

#### 受け入れ基準

4.1. `plan` が実行されたとき、slide workflow は Resolved Design Contract の token constraints、density hints、adherence rules、既存 layout vocabulary を参照して `plan.md` と `slide-blueprint.md` を生成しなければならない。

4.2. `plan` が `Layout` を生成するとき、slide workflow は Claude Design Source から直接 layout vocabulary が得られない場合でも、既存 slide workflow の許可済み layout vocabulary と token constraints の範囲で `Layout` を記録しなければならない。

4.3. `plan` が `Visual` または `Visual Strategy` を生成するとき、slide workflow は `components` が空でも失敗せず、token constraints と既存 visual vocabulary で実現できる visual 種別を記録しなければならない。`source_catalog` に components、starting points、cards、sample slides、templates、themes、fonts、component prompts が存在する場合は、brief に合うものだけを選定し、選定理由と不採用理由を記録しなければならない。

4.4. `plan` が成功したとき、slide workflow は CSS、front matter style、または `_class` の style 定義を `plan` 成果物として生成してはならない。

4.5. `plan` が成功したとき、slide workflow は Resolved Design Contract の source path、fingerprint、namespace、token summary を `plan.md` と `slide-blueprint.md` の確認可能な metadata として記録しなければならない。

4.6. Resolved Design Contract と brief の要求が両立しない場合、slide workflow は推測で layout や visual を補完せず、利用者が修正対象を確認できる finding または失敗情報を残さなければならない。

### 要件 5: compose は同じ Design Contract から slide source を生成する

**目的:** deck 作成者として、承認済み plan と同じ Design Contract から `SLIDES.md` と section source を生成してほしい。そうすることで、plan の構成意図と実際の CSS / `_class` のズレを防げる

#### 受け入れ基準

5.1. `compose` が実行されたとき、slide workflow は marker の Resolved Design Contract fingerprint と `plan.md` / `slide-blueprint.md` に記録された fingerprint を照合しなければならない。`compose --force` の場合、この照合は既存成果物の archive / clean より前に行わなければならない。

5.2. fingerprint が一致しない場合、slide workflow は compose の `needs_input` または review blocker として不一致を報告し、`SLIDES.md` や `sections/*` の生成を成功扱いしてはならない。

5.3. fingerprint が一致したとき、slide workflow は Resolved Design Contract の token constraints から `SLIDES.md` front matter CSS、layout class、section HTML/CSS、必要な visual source を生成しなければならない。

5.4. `compose` が CSS custom properties を生成するとき、slide workflow は Claude Design Source の token 名と値を保持し、raw color、raw px、未提供 font-family の新規混入を避けなければならない。

5.5. `compose` が HTML visual を含む slide source を生成するとき、slide workflow は Resolved Design Contract の token constraints と既存 visual vocabulary に従った HTML/CSS を生成しなければならない。

5.6. `compose` が成功したとき、slide workflow は `design-system.md` を compose の canonical source artifact として生成または要求してはならない。

5.7. 既存 deck に `design-system.md` が存在する場合、slide workflow はその存在だけを Claude Design Source、Design Contract override、または compose 成功条件として扱ってはならない。

5.8. `compose` が成功したとき、slide workflow は使用した Claude Design Source、Resolved Design Contract path、fingerprint、生成した layout classes、CSS token の概要を compose の確認可能な report に記録しなければならない。

### 要件 6: review は Design Contract との不一致を検出する

**目的:** reviewer と deck 作成者として、plan、SLIDES、CSS、visual component が同じ Design Contract に従っていることを確認したい

#### 受け入れ基準

6.1. `compose-review` が実行されたとき、slide workflow は `plan.md`、`slide-blueprint.md`、marker の Resolved Design Contract fingerprint が一致することを確認しなければならない。

6.2. `compose-review` が実行されたとき、slide workflow は `SLIDES.md` の `_class` と style 定義が Resolved Design Contract の token constraints に対応していることを確認しなければならない。

6.3. `compose-review` が実行されたとき、slide workflow は HTML visual component が Resolved Design Contract の token constraints と既存 visual vocabulary に従っていることを確認しなければならない。

6.4. `_adherence.oxlintrc.json` が Claude Design Source に含まれる場合、slide workflow は raw hex color、raw px value、未提供 font-family の混入を review finding として報告しなければならない。ただし Resolved Design Contract 由来の custom property 定義そのものは正当な token 定義として扱い、finding 対象にしてはならない。

6.5. Design Contract に対応しない `Layout`、`_class`、style 定義、または visual component が見つかった場合、slide workflow は compose review の finding として報告しなければならない。

6.6. Design Contract との不一致が `compose` 成果物の修正だけで解消できない場合、slide workflow は re-plan または Claude Design Source 更新が必要であることを利用者が確認できる形で報告しなければならない。

6.7. `polish-inspect` または `polish-fix` が `design_contract.path` を持つ marker を読む場合、slide workflow は Resolved Design Contract を読み、marker と Resolved Design Contract の `fingerprint.contract_sha256`、`SLIDES.md` front matter CSS、`_class`、`sections/*` の HTML/CSS、HTML visual、`images/*` が token constraints、brand fonts、adherence metadata、`guidance`、`source_catalog` と矛盾しないことを確認しなければならない。

6.8. `polish-inspect` または `polish-fix` が Design Contract fingerprint mismatch、token drift、token 定義外の raw color / raw px / 未提供 font-family、token と無関係な class / style、`guidance` または `source_catalog` との矛盾を見つけた場合、slide workflow は review finding として報告しなければならない。

6.9. `design_contract` がない既存 deck を `polish-inspect` または `polish-fix` が扱う場合、slide workflow は Legacy Polish Path として Design Contract fingerprint と token drift の判定だけをスキップし、render evidence と既存 source artifact から判断できる visual / layout / render finding を記録または修正できなければならない。

### 要件 7: command surface と no-copy 契約を維持する

**目的:** workflow 利用者として、Claude Design Source 導入後も既存の `plan / compose / polish / deliver` の操作感と no-copy 実行を保ちたい

#### 受け入れ基準

7.1. Claude Design Source 導入後の間、slide workflow は top-level workflow command を `plan / compose / polish / deliver` のまま維持し続けなければならない。

7.2. Claude Design Source 導入後の間、slide workflow は `design`、`design:approve`、または Design Contract 専用の新しい approval command を user-facing command として要求してはならない。

7.3. Claude Design Source 導入後の間、slide workflow は `plan` と `compose` の human approval 所有権、`polish` と `deliver` の approval 不要性、report freshness 判定を維持し続けなければならない。

7.4. `plan` または `compose` が通常実行されるとき、slide workflow は consumer workspace へ `.takt/workflows`、`.takt/facets`、または package template asset を自動コピーしてはならない。

7.5. `eject` が実行された場合でも、slide workflow は workflow/facet template の eject 契約を維持し、Claude Design Source を package default として consumer workspace へ生成してはならない。

### 要件 8: Validation Surface を更新する

**目的:** maintainer として、Claude Design Source import が package 配布や smoke validation で検出可能な契約として固定されてほしい

#### 受け入れ基準

8.1. メンテナが smoke validation を実行したとき、slide workflow は `design-system.md` の存在ではなく、Claude Design Source の解決、Resolved Design Contract の生成、`plan` への反映、`compose` への適用を検証しなければならない。

8.2. smoke validation が Claude Design Source の fixture を使うとき、slide workflow は `_ds_manifest.json`、token CSS、optional adherence metadata、`SKILL.md` / `readme.md` guidance、component prompt、starting point、card、sample slide、template、theme、font、asset catalog を含む sample を検証しなければならない。

8.3. メンテナが foundation validation を実行したとき、slide workflow は marker shape、plan metadata、compose fingerprint check、legacy `design-system.md` 非依存を検証しなければならない。

8.4. メンテナが package boundary validation を実行したとき、slide workflow は importer library、workflow/facet updates、fixture builder が package から実行可能であることを検証しなければならない。

8.5. メンテナが no-copy validation を実行したとき、slide workflow は Claude Design Source import によって consumer workspace へ `.takt/workflows` または `.takt/facets` が生成されないことを検証しなければならない。

8.6. Claude Design Source の検証が失敗した場合、slide workflow は失敗した source file、対象 command、確認すべき artifact を利用者またはメンテナが特定できる結果を表示しなければならない。

8.7. メンテナが foundation validation を実行したとき、slide workflow は invalid sibling zip、JSON object ではない manifest、object 形式の `brandFonts`、引用符なし font token、optional catalog、`--force` archive 失敗時の Resolved Design Contract 非保存、compose force の plan fingerprint mismatch before archive、rejected rerun の validation-before-archive、malformed marker からの復旧、stale / corrupt Design Contract marker、stale contract hash の破棄を検証しなければならない。

### 要件 9: 既存 deck と既存成果物への影響を限定する

**目的:** maintainer と deck 作成者として、Claude Design Source 導入が既存 deck の不要な全面移行や再生成を強制しない状態にしたい

#### 受け入れ基準

9.1. Claude Design Source 導入後の間、slide workflow は既存 deck の `SLIDES.md`、`sections/*`、`images/*` を自動的に全面再生成してはならない。

9.2. 既存 deck に `design-system.md` が残っている場合、slide workflow はその file を理由に `plan` または `compose` を失敗させてはならない。

9.3. 既存 deck が Claude Design Source へ移行していない場合、slide workflow は missing source を明確に報告し、`design-system.md` から暗黙移行してはならない。

9.4. 既存 deck が Claude Design Source へ移行する場合、slide workflow は配置先が `slides/<deck>/design/` であることを利用者が確認できる案内または finding を残さなければならない。

9.5. 既存 deck が Claude Design Source 導入前に compose 済みで Resolved Design Contract を持たない場合でも、`polish` は render evidence と既存 source artifact で検査・修正できる visual/layout/render finding を扱えるようにしなければならない。Design Contract 不在そのものを blocked finding または blocked fix 理由にしてはならない。

### 要件 10: Design Brief で Claude Design Source の作成意図を固定する

**目的:** deck 作成者として、Claude Design に何を渡して Design System を作ったかを deck 内に残したい。そうすることで、Claude Design Source、Resolved Design Contract、`plan` の間の drift を検出しやすくできる

#### 受け入れ基準

10.1. 利用者が Claude Design Source を作成するとき、slide workflow は `slides/<deck>/design/design-brief.md` を Claude Design に渡す authoring input の正として扱わなければならない。

10.2. Design Brief は `brief.md` / `brief.normalized.md` の資料要求、brand constraints、audience constraints、style constraints を primary input として作成されなければならない。通常の新規作成 flow では、生成済み `plan.md` または `slide-blueprint.md` を Claude Design Source 作成の primary input として扱ってはならない。

10.3. Design Brief は Claude Design Source の生成意図と provenance を固定する authoring artifact であり、Claude Design Source、Design Contract、Resolved Design Contract、または `design-system.md` の代替入力として扱ってはならない。

10.4. `slides/<deck>/design/design-brief.md` が存在する場合、slide workflow はその path と SHA-256 を Resolved Design Contract、Workflow Handoff Marker、`plan.md`、`slide-blueprint.md` の確認可能な metadata として記録しなければならない。

10.5. `slides/<deck>/design/design-brief.md` が存在しない場合でも、新規 / 既存 deck を問わず、slide workflow は Claude Design Source import だけを理由に失敗させてはならない。ただし drift protection が無効であることと、推奨配置先を利用者が確認できる warning または finding を残さなければならない。

10.6. `compose` または review が、`plan.md` / `slide-blueprint.md` に記録された Design Brief fingerprint と現在の Design Brief fingerprint の不一致を検出した場合、slide workflow は source artifact 生成を成功扱いせず、re-plan または Claude Design Source 更新が必要であることを blocker として報告しなければならない。

10.7. 既存 `plan.md` を参考に Design Brief または Claude Design Source を作り直した場合、slide workflow はその `plan.md` を design authoring の primary input として扱わず、更新後の Claude Design Source から `plan` を再実行する必要があることを利用者が確認できる finding として残さなければならない。
