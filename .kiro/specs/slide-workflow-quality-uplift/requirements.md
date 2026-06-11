# 要件定義

## はじめに

`slide-workflow-quality-uplift` は、slide workflow(plan / compose / polish / deliver)の品質定義を、実運用で実証された到達水準(`slides/takt-sdd/SLIDES.md` HEAD)へ引き上げる機能です。

takt-sdd deck の git 履歴差分分析により、workflow 産出物への人手修正の大半は、品質定義が「定義していない(layout 語彙・発表コンテキスト・尺契約)」「禁止している(inline SVG)」「存在チェック止まりで水準を問わない(speaker notes・タイトル先鋭度)」品質次元に集中していることが判明しています。本機能はこれらの品質次元を workflow の観測可能な挙動として定義し、同じ brief から生成した産出物への人手修正が構造的再構築ではなく微調整で済む状態を目指します。

## 境界コンテキスト

- **対象範囲**: plan の layout 要求の実現可能性、図版(inline SVG)の品質規約、speaker notes の尺契約、brief 正規化の入力契約(イベント・登壇者・事実根拠)、review の先鋭度・密度基準、描画を壊す機械的要因の防止、および品質定義変更後の既存契約・配布との整合。
- **対象外**: workflow の command/state/report/approval contract の再設計、render 結果の知覚に基づく視覚判定(`slide-workflow-visual-review` が所有)、図版以外の portability 課題(repo-local な build 入口参照の解消)、TAKT 本体・provider の変更、既存 deck の再生成。
- **隣接システム／スペックへの期待**: `slide-workflow-foundation` が report schema と review 契約を、`slide-workflow-orchestration` が canonical workflow 構造を、`slide-workflow-ai-quality-gate` が gate 設計パターンを提供する。`takt-marp-global-installer` は template 配布機構を提供し、品質定義の変更が配布 template と同期されることを期待する。`slide-workflow-visual-review`(後続)は本機能が確定させる品質基準の語彙を視覚判定に利用する。

## 要件

### 要件 1: plan が要求する layout を実現できる

**目的:** workflow 利用者として、plan の構成意図がそのまま compose で実現されるために、layout 語彙の不足で産出物を手動再構築しなくてよい状態が欲しい

#### 受け入れ基準

1.1. plan が実証済み layout 語彙(カードグリッド、コードと解説の 2 列、登壇者プロフィール、レイヤー図等)を指定したとき、slide workflow は対応する style 定義を持つスライドを生成しなければならない。

1.2. plan の layout 指定に既存の layout 語彙で対応できない場合、slide workflow は命名・文書化規約に従って新しい layout class を定義して layout 要求に対応しなければならない。

1.3. 新しい layout class が定義されたとき、slide workflow はその用途と構造を後続の review / fix が識別できる形で文書化しなければならない。

1.4. plan の layout 指定に対応する style 定義が成果物に存在しない場合、slide workflow は compose の review でそれを重大な finding として報告しなければならない。

### 要件 2: 図版を inline SVG で品質制御できる

**目的:** workflow 利用者として、図版の日本語文字描画とサイズが描画時に崩れないために、inline SVG をガードレール付きで利用できる状態が欲しい

#### 受け入れ基準

2.1. 図版に inline SVG が用いられた場合、slide workflow は inline SVG の利用自体を品質違反として扱ってはならない。

2.2. inline SVG が用いられたとき、slide workflow は日本語フォントを優先するフォントスタック規約に適合した文字描画指定を持つ図版を生成しなければならない。

2.3. inline SVG が用いられたとき、slide workflow はスライド領域内に収まるサイズ制御を伴う図版を生成しなければならない。

2.4. 図版に本文相当の長文が流し込まれた場合、slide workflow は review でそれを finding として報告しなければならない。

2.5. slide workflow は常に外部 SVG ファイル参照と inline SVG の使い分け基準を品質定義として提供しなければならない。

2.6. フォントスタック規約またはサイズ規約に適合しない inline SVG が成果物にある場合、slide workflow は review でそれを finding として報告しなければならない。

### 要件 3: speaker notes が発表の尺と整合する

**目的:** workflow 利用者として、notes をそのまま登壇リハーサルに使えるために、尺配分と強調点を含む speaker notes が欲しい

#### 受け入れ基準

3.1. 発表時間が確定している brief から compose したとき、slide workflow は各スライドの speaker notes にスライドの所要時間と累計時間を含めなければならない。

3.2. speaker notes の累計時間が発表時間と整合しない場合、slide workflow は review でそれを finding として報告しなければならない。

3.3. compose が完了したとき、slide workflow は各スライドの speaker notes に話す内容の強調点を含めなければならない。

3.4. 発表時間が brief に存在しない場合、slide workflow は尺配分の記載を要求せず、推測した時間を記載してはならない。

### 要件 4: 発表コンテキストの入力を収集し成果物へ反映する

**目的:** workflow 利用者として、イベント名・登壇者・実績根拠が成果物に正しく載るために、それらの入力が体系的に収集される状態が欲しい

#### 受け入れ基準

4.1. brief の正規化が実行されたとき、slide workflow はイベント名と発表時間を必須項目として確認し、欠落している場合は未指定であることを正規化結果に明示しなければならない。

4.2. brief の正規化が実行されたとき、slide workflow は登壇者プロフィールと事実インベントリ(version、数値実績等の根拠)を推奨項目として収集しなければならない。

4.3. イベント名または登壇者プロフィールが収集されている場合、slide workflow はそれらを成果物の対応するスライド(タイトル、自己紹介相当)に反映しなければならない。

4.4. slide workflow は常に、brief に存在しないイベント名・実績数値・version を生成または補完してはならない。

4.5. 必須項目が未指定のまま後続 command が実行された場合、slide workflow は利用者が欠落を確認できる情報を残さなければならない。

### 要件 5: メッセージ先鋭度と情報密度を review が判定する

**目的:** workflow 利用者として、deck 固有の主張を持つスライドを得るために、汎用ラベルや低密度な列挙が review で検出される状態が欲しい

#### 受け入れ基準

5.1. タイトルまたはリード文が当該 deck 以外にも当てはまる汎用表現である場合、slide workflow は review でそれを finding として報告しなければならない。

5.2. bullet の列挙が表・カード・コード例等のより伝達効率の高い形式へ置換可能である場合、slide workflow は review でそれを finding として報告しなければならない。

5.3. 先鋭度または密度の finding を報告するとき、slide workflow は既存の severity 分類と report 契約に従わなければならない。

### 要件 6: 描画を壊す機械的要因を防ぐ

**目的:** workflow 利用者として、フォントや front matter 起因の描画破損をなくすために、機械的規約が品質定義として明文化された状態が欲しい

#### 受け入れ基準

6.1. compose が成果物を生成したとき、slide workflow は解決可能な font path と日本語フォント優先順に適合した style 定義を生成しなければならない。

6.2. 成果物に HTML 要素が含まれるとき、slide workflow は HTML 描画を有効化する front matter 設定を伴う成果物を生成しなければならない。

6.3. フォント規約または front matter 規約に適合しない成果物がある場合、slide workflow は review または検証でそれを finding として報告しなければならない。

### 要件 7: 既存契約と配布の整合を保つ

**目的:** workflow メンテナとして、品質定義の変更が既存の workflow 契約と配布を壊さないために、変更が回帰検証と配布同期を伴う状態が欲しい

#### 受け入れ基準

7.1. 品質定義の変更が適用された後も、slide workflow は plan / compose / polish / deliver の成功条件・状態遷移・report schema を変更せず維持しなければならない。

7.2. 品質定義の変更が適用されたとき、slide workflow は配布用 package template との同期を保ち、template drift 検証を成功させなければならない。

7.3. 品質定義の変更が適用された後、slide workflow は mock provider の smoke validation を成功させなければならない。

7.4. slide workflow は常に、品質定義の変更を理由として既存 deck の成果物の再生成を要求してはならない。
