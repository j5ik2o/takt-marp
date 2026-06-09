# 要件ドキュメント

## 概要

`slide-workflow-foundation` は、Marp slide workflow を `plan / compose / polish / deliver` の正規コマンドへ移行する前提として、決定論的な target 解決、状態判定、approval 記録、再実行制御、render evidence の土台、npm entrypoint を整える spec です。

現在は `slide:draft`、`slide:review-revise`、`slide:build-qa` のようなコマンドと TAKT 内部ループの責務が混ざり、report の存在や古い内容を成功扱いする危険があります。この spec では TAKT workflow YAML や facet の大規模再編を行わず、後続 `slide-workflow-orchestration` が依存できる command/state contract と deterministic script foundation を先に確定します。

## 境界コンテキスト

- **対象**: command/state model の ADR と workflow docs 更新、report/approval/front matter schema docs、`scripts/lib/takt-marp-slide-workflow.mjs`、state check script、approval script、workflow runner、render evidence script の foundation、`package.json` の `slide:*` entrypoint 更新
- **対象外**: `takt-marp-slide-compose`、`takt-marp-slide-polish`、`takt-marp-slide-deliver` の完成版 TAKT workflow 実装、既存 workflow YAML/facet/output-contract の大規模再編、smoke deck の完全 end-to-end 実行、旧コマンド互換 alias、full YAML parser 依存の追加
- **隣接する期待**: 後続 `slide-workflow-orchestration` は、この spec が定める report schema、approval file の人間所有、runner preflight、force/rerun semantics を前提に workflow YAML と facet を置き換える。この spec は後続 workflow の中身を実装しないが、未実装 workflow を素の失敗として放置しない entrypoint 契約を用意する。

## 要件

### 要件 1: slide command surface と target contract を正規化する

**目的:** スライド作成者として、すべての workflow を同じ target 形式で実行したい。そうすることで、`brief.md` 直指定や旧コマンド名による状態境界の混乱を避けられる。

#### 受け入れ条件

1.1. When 利用者が `npm run slide:plan`、`slide:compose`、`slide:polish`、`slide:deliver` を実行する場合, the slide workflow foundation shall `slides/<deck>` を唯一の target contract として受け付ける。

1.2. If 利用者が `slides/<deck>/brief.md`、任意の Markdown ファイル、または `slides/` 外の path を target にする場合, the slide workflow foundation shall TAKT を起動する前に actionable error で拒否する。

1.3. When 利用者が `package.json` の `slide:*` scripts を確認する場合, the slide workflow foundation shall `plan / compose / polish / deliver` と `check-state / approve` の wrapper script entrypoint を表示する。

1.4. The slide workflow foundation shall `slide:draft`、`slide:review-revise`、`slide:build-qa`、top-level `qa` の互換 entrypoint を正規 command surface に含めない。

### 要件 2: report と approval の front matter schema を機械判定できるようにする

**目的:** workflow 利用者と後続 workflow 実装者として、状態判定を report 本文やファイル存在に依存せず検証したい。そうすることで、古い report や失敗 report を成功として扱う事故を防げる。

#### 受け入れ条件

2.1. When workflow report が生成される場合, the slide workflow foundation shall YAML front matter と Markdown body を持つ report schema を docs として定義する。

2.2. When supervision report が状態判定に使われる場合, the slide workflow foundation shall `command`、`step`、`state`、`result`、finding counts、approval requirement を front matter から検証できる契約として定義する。

2.3. When approval file が状態判定に使われる場合, the slide workflow foundation shall `status: approved`、`approved_by`、`approved_at`、`waivers`、`decisions` を front matter から検証できる契約として定義する。

2.4. When supervision report または approval file が状態判定に使われる場合, the slide workflow foundation shall freshness contract を front matter から検証できる形で定義する。Supervision report は `target`、`generated_at`、`workflow_run_id` を持つ。Approval file は `target`、`approved_at`、`supervision_workflow_run_id` を持ち、approval 自体の `generated_at` または `workflow_run_id` は要求しない。`generated_at` と `approved_at` は parse 必須の記録時刻であり、stale 判定の主キーは canonical supervision の `workflow_run_id` と approval の `supervision_workflow_run_id` の一致である。

2.5. When review、inspect、verify、fix report が生成される場合, the slide workflow foundation shall stable finding model と TAKT `loop_monitors` contract を docs として定義する。Finding 単体の canonical field は `finding_id`、`severity`、`status`、`cycle` であり、`status` 値は `new`、`resolved`、`persists`、`reopened` のいずれかである。Loop monitoring は deck-local report の count field ではなく、workflow YAML の `cycle`、`threshold`、`judge` で扱い、fix report の必須 field と混同しない。

2.6. The slide workflow foundation shall front matter parser のためだけに新規 package dependency を追加しない。

### 要件 3: state check と human approval を deterministic script で扱う

**目的:** 利用者として、次の command に進める状態かどうかを明確に確認し、人間承認を TAKT 生成物から分離して記録したい。

#### 受け入れ条件

3.1. When 利用者が `slide:check-state` に `--require plan:planned:approved`、`--require compose:composed:approved`、または `--require polish:polished` を指定する場合, the slide workflow foundation shall matching supervision と必要な approval を front matter で検証する。

3.2. If required supervision report または approval file が missing、不一致、または rejected である場合, the slide workflow foundation shall 修正に必要な path と期待値を含む actionable error で非ゼロ終了する。

3.3. When 利用者が `slide:approve` を `plan` または `compose` に対して実行する場合, the slide workflow foundation shall matching supervision report が `result: passed` であることを確認して approval file を生成する。

3.4. If 利用者が `slide:approve` を `polish` または `deliver` に対して実行する場合, the slide workflow foundation shall approval file を作らずに拒否する。

3.5. If 利用者が `slide:approve` に `--by` を指定しない場合, the slide workflow foundation shall approval file を作らずに拒否する。

3.6. The slide workflow foundation shall TAKT workflow agent が approval file を作成する前提を含めず、approval file を人間の意思決定記録として扱う。

### 要件 4: workflow runner が preflight、rerun、force invalidation を制御する

**目的:** 利用者として、successful state の誤再実行や stale output の混入を避けつつ、reject 後の再試行と明示的な force 再実行を扱いたい。

#### 受け入れ条件

4.1. When 利用者が `slide:plan`、`slide:compose`、`slide:polish`、`slide:deliver` を実行する場合, the slide workflow foundation shall TAKT 起動前に target、command prerequisites、対応する `.takt/workflows/takt-marp-slide-{command}.yaml` の存在を検証する。

4.2. If 対象 command が既に successful state に到達していて `--force` が指定されていない場合, the slide workflow foundation shall TAKT を起動せず rerun を拒否する。

4.3. If 対象 command の canonical supervision が `result: rejected` である場合, the slide workflow foundation shall `--force` なしでも再実行を許可し、既存 command reports を history へ archive する。

4.4. When 利用者が `--force` を指定する場合, the slide workflow foundation shall target、command prerequisites、workflow YAML availability、TAKT executable availability の preflight が通った後で、対象 command 以降の canonical reports と approval files を archive し、stale generated outputs を clean してから TAKT を起動する。

4.5. The slide workflow foundation shall force invalidation で source artifacts を自動削除しない。

4.6. When runner が TAKT を起動する場合, the slide workflow foundation shall `./node_modules/.bin/takt --pipeline --skip-git` を使い、preflight 失敗時には TAKT を起動せず、archive/cleanup も実行しない。

4.7. If 対応する workflow YAML が存在しない場合, the slide workflow foundation shall TAKT を起動せず、未実装 workflow と次に実装すべき spec または expected path を示す actionable error で非ゼロ終了する。

### 要件 5: render evidence script の foundation を提供する

**目的:** 後続 `polish` workflow 実装者として、visual inspection 用の render evidence を official deliverable と分離して生成する土台がほしい。

#### 受け入れ条件

5.1. When render evidence script が実行される場合, the slide workflow foundation shall `slides/<deck>` target と cycle を検証し、`.takt/render/<deck>/cycle-{n}/` を evidence root として扱う。

5.2. When render evidence script が evidence を生成する場合, the slide workflow foundation shall HTML/slide PNG、PDF、PDF raster availability の結果を `metadata.json` に記録できる foundation を提供する。

5.3. If optional PDF rasterization tool が利用できない場合, the slide workflow foundation shall failure ではなく degraded evidence として metadata に記録する。

5.4. The slide workflow foundation shall render evidence を `dist/<deck>/` の official delivery artifacts と混同しない。

### 要件 6: foundation の回帰を検証できる

**目的:** maintainer として、後続 workflow YAML 再編の前に command/state/approval foundation の破壊的な回帰を検出したい。

#### 受け入れ条件

6.1. When 自動検証を実行する場合, the slide workflow foundation shall invalid target、missing approval、invalid approval command、successful rerun rejection、rejected rerun archive、force invalidation の主要パスを検証できる。

6.2. When 自動検証を実行する場合, the slide workflow foundation shall front matter parser と state/approval validator が documented subset を判定できることを検証できる。

6.3. When 自動検証を実行する場合, the slide workflow foundation shall `package.json` の `slide:*` scripts が wrapper script entrypoint にそろっていることを検証できる。

6.4. The slide workflow foundation shall TAKT workflow YAML/facet の完成や smoke deck の完全 end-to-end 実行を、この spec の成功条件に含めない。
