# 要件ドキュメント

## 概要

`slide-workflow-orchestration` は、Marp スライド生成の TAKT workflow と facet 群を `plan / compose / polish / deliver` の正規 command model に合わせて再構築する spec です。

現在の workflow は `draft`、`review-revise`、`build-qa` がトップレベル command として露出しており、各 command 内部に閉じるべき review、fix、loop monitor、supervision の責務が通常操作面へ漏れています。この spec では `slide-workflow-foundation` が定めた target、report schema、approval、runner preflight、rerun/force 契約を前提に、TAKT YAML と facet/output-contract の orchestration 層だけを置き換えます。

## 境界コンテキスト

- **対象**: 4つの canonical TAKT workflow YAML、旧 workflow YAML の削除、Marp/slide facet の再編、supervisor/loop monitor persona、canonical report output contract、利用可能な built-in facet の `{extends:<parent>}` 採用、step 名と report 名の正規化
- **対象外**: deterministic script foundation 実装、`slide:approve` 実装、front matter parser 実装、artifact readability script details、smoke run と収束修正、workflow 内 git 操作、旧 command 互換 alias
- **隣接する期待**: `slide-workflow-foundation` は `slides/<deck>` target、state/approval validation、canonical supervision schema、runner preflight、render evidence foundation を提供済みである。後続 `slide-workflow-smoke-validation` は、この spec で置き換えた YAML/facet を実行して smoke deck の収束を扱う。

## 要件

### 要件 1: canonical workflow surface を4 commandに限定する

**目的:** スライド作成者として、操作できる workflow を `plan / compose / polish / deliver` に限定したい。そうすることで、内部レビューや QA の中間状態を command と誤認しない。

#### 受け入れ条件

1.1. When 利用者が TAKT workflow 一覧または `.takt/workflows/` を確認する場合, the slide workflow orchestration shall `takt-marp-slide-plan`、`takt-marp-slide-compose`、`takt-marp-slide-polish`、`takt-marp-slide-deliver` を canonical workflow として提供する。

1.2. The slide workflow orchestration shall `takt-marp-slide-draft`、`takt-marp-slide-review-revise`、`takt-marp-slide-build-qa` を実行可能な workflow file として残さない。

1.3. The slide workflow orchestration shall 旧 workflow 名の互換 alias または wrapper workflow を追加しない。

1.4. When workflow step 名を確認する場合, the slide workflow orchestration shall step name を snake_case に統一する。

### 要件 2: 各 workflow が品質ループを内部に閉じる

**目的:** workflow 利用者として、review、fix、loop monitor、supervision を個別 command として実行せず、各 command が自分の完了可否を閉じて判断してほしい。

#### 受け入れ条件

2.1. When canonical workflow が実行される場合, the slide workflow orchestration shall `work -> review/inspect/verify -> fix -> review/inspect/verify -> supervise` の責務順を workflow 内部 step として表現し、反復監視は TAKT workflow 直下の `loop_monitors` で定義する。

2.2. If review、inspect、または verify step が修正可能な finding を返す場合, the slide workflow orchestration shall 独立した fix step を経由して同じ workflow 内で再判定し、TAKT `loop_monitors` が非生産的な反復を監視する。

2.3. If loop monitor が非収束、振動、または同一 finding の反復を判定する場合, the slide workflow orchestration shall supervision 前に workflow を失敗または停止状態へルーティングする。

2.4. When supervision step が実行される場合, the slide workflow orchestration shall 詳細 review を再実施せず、workflow 全体の完了契約、report schema、成果物境界、前段 finding の扱いを検証する。

### 要件 3: command ごとの成果物境界を分離する

**目的:** スライド作成者として、各 command がどの成果物を作り、どこまで変更してよいかを明確にしたい。そうすることで、polish が plan 内容を壊したり、deliver が visual inspection を再実施したりすることを防げる。

#### 受け入れ条件

3.1. When `takt-marp-slide-plan` が成功する場合, the slide workflow orchestration shall `brief.normalized.md`、`plan.md`、`review/plan-supervision.md` を plan command の canonical 成果物として扱う。

3.2. When `takt-marp-slide-compose` が成功する場合, the slide workflow orchestration shall `design-system.md`、`SLIDES.md`、`images/*.svg`、`review/compose-supervision.md` を compose command の canonical 成果物として扱い、render output を成功条件に含めない。

3.3. When `takt-marp-slide-polish` が成功する場合, the slide workflow orchestration shall render evidence と `review/polish-supervision.md` を polish command の canonical 成果物として扱い、visual/layout/render 関連の修正だけを許可する。

3.4. When `takt-marp-slide-deliver` が成功する場合, the slide workflow orchestration shall `dist/<deck>/` の最終成果物と `review/deliver-supervision.md` を deliver command の canonical 成果物として扱い、visual inspection を行わない。

3.5. The slide workflow orchestration shall `plan` と `compose` で approval file を生成せず、`polish` と `deliver` で通常の approval file を要求しない。

3.6. When `takt-marp-slide-plan` が `plan.md` を生成する場合, the slide workflow orchestration shall `deliverables` を `html`、`pdf`、`pptx` の配列として正規化し、`deliver` は `brief.md` ではなく `plan.md` の `deliverables` を authoritative contract として読む。

3.7. When `takt-marp-slide-deliver` の `build_delivery` step が実行される場合, the slide workflow orchestration shall export 前に `dist/<deck>/` を clean し、stale official artifacts が今回の deliverables と混ざらないようにする。

### 要件 4: report output contract を canonical schema に統合する

**目的:** 後続 workflow 実装者と利用者として、report 名と front matter が command/state model と一致していることを機械的に確認したい。

#### 受け入れ条件

4.1. When workflow step が report を出力する場合, the slide workflow orchestration shall report 名を `{command}-{role}.md` の形式に統一する。

4.2. When supervision report が出力される場合, the slide workflow orchestration shall `slide-workflow-foundation` の supervision front matter contract と一致する output contract を使う。

4.3. When fix/review loop を監視する場合, the slide workflow orchestration shall deck-local loop monitor report を生成せず、TAKT `loop_monitors` の `cycle`、`threshold`、`judge` を使う。

4.4. The slide workflow orchestration shall `QA` を top-level workflow 名、command 名、または canonical report role 名として使わない。

### 要件 5: facet layer を thin-diff と built-in extends に整理する

**目的:** workflow 保守者として、汎用 mechanics を built-in facet に寄せ、Marp 固有の判断だけを local facet に残したい。そうすることで、prompt の重複と責務肥大化を避けられる。

#### 受け入れ条件

5.1. When local instruction、policy、knowledge、または output contract facet が built-in facet と同じ汎用 mechanics を含む場合, the slide workflow orchestration shall 利用可能な範囲で `{extends:<parent>}` を採用する。

5.2. The slide workflow orchestration shall persona facet には `{extends:<parent>}` を使わず、TAKT の persona 継承非対応制約に従う。

5.3. The slide workflow orchestration shall `takt-marp-general-slide-quality`、`takt-marp-slide-quality`、`takt-marp-svg-first-visual`、`takt-marp-worker-boundary` の policy 責務を分離し、Marp 固有制約を `takt-marp-slide-quality` と `takt-marp-svg-first-visual` に閉じる。

5.4. The slide workflow orchestration shall `takt-marp-slide-supervisor` persona を追加し、supervision の責務を writer、reviewer、reviser、QA から分離する。Loop monitoring は dedicated local persona ではなく TAKT `loop_monitors` の judge と built-in instruction に委ねる。

5.5. When output contract facet を確認する場合, the slide workflow orchestration shall plan、compose、polish、deliver の各 step が同じ canonical report schema family を参照していることを確認できる。

### 要件 6: orchestration 変更を smoke 前に静的検証できる

**目的:** maintainer として、smoke run に進む前に YAML/facet の参照切れ、旧 workflow の残存、foundation contract との不一致を検出したい。

#### 受け入れ条件

6.1. When orchestration 変更を検証する場合, the slide workflow orchestration shall 4つの canonical workflow YAML が TAKT workflow schema と参照解決に合うことを確認できる。

6.2. When orchestration 変更を検証する場合, the slide workflow orchestration shall 旧 workflow file が `.takt/workflows/` に残っていないことを確認できる。

6.3. When orchestration 変更を検証する場合, the slide workflow orchestration shall workflow が参照する persona、policy、instruction、knowledge、output contract facet がすべて存在することを確認できる。

6.4. The slide workflow orchestration shall smoke deck の完全 end-to-end 実行、render 品質の収束修正、旧 command 互換性の検証を、この spec の成功条件に含めない。
