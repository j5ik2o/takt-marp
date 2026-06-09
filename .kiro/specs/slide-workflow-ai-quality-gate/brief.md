# Brief: slide-workflow-ai-quality-gate

## Problem

Marp slide workflow の各 command は AI agent が source artifact や report を生成するため、通常 review に入る前から AI 特有の問題が混入しうる。具体的には、存在しない path/API/tool の前提、入力にない主張、過度な抽象化、指示外の後方互換追加、未検証の断定などが review/fix loop に流れ込み、通常 review が content や visual の品質確認ではなく AI 幻覚の後始末に使われてしまう。

## Current State

`plan / compose / polish / deliver` は各 workflow 内で work、review/inspect/verify、fix、supervision を閉じる。TAKT `loop_monitors` で通常 review/fix の非収束も検出できる。一方で、AI antipattern を専門に見る callable gate はなく、通常 review 前に「AI 生成物として信用してよいか」を横断的に確認する仕組みがない。

## Desired Outcome

すべての canonical workflow が通常 review/inspect/verify に進む前に AI antipattern quality gate を通る。gate は AI 特有の問題を review report に記録し、修正可能なものは専用 fix step で source artifact または report を修正して再レビューする。current command の境界内で安全に直せない場合は replan 相当の route に戻し、曖昧な成功や evidence-free な no-fix を許可しない。

## Approach

`takt-sdd` の `kiro-discovery-ai-quality-gate` と同じ callable subworkflow pattern を採用する。`takt-marp-slide-ai-quality-gate.yaml` を internal callable workflow として追加し、各 command の work step 成功後、通常 review/inspect/verify 前に `kind: workflow_call` で呼び出す。

gate は command ごとの fix instruction と domain knowledge を引数に取り、共通の AI antipattern review と command-local fix を再利用する。`need_replan` は command の work step へ戻し、`COMPLETE` は通常 review/inspect/verify へ進め、`ABORT` は workflow を停止する。

## Scope

- **In**:
  - callable AI antipattern gate workflow の追加
  - AI antipattern reviewer/fix instruction と output contract の追加
  - `plan / compose / polish / deliver` の通常 review/inspect/verify 前への gate 挿入
  - gate report と fix report の stale/cross-run/evidence-free no-fix を避ける契約
  - smoke validation による gate placement、route、report presence の検証
- **Out**:
  - TAKT runtime の `workflow_call` 実装変更
  - 通常 review/inspect/verify の品質基準の再定義
  - command/state model、approval ownership、deliverable enum の変更
  - web search や外部 fact checking の標準化
  - AI gate を GitHub PR review automation に接続すること

## Boundary Candidates

- callable gate workflow: AI antipattern review/fix loop と return condition だけを所有する
- caller command workflows: gate の挿入位置と `COMPLETE / need_replan / ABORT` route だけを所有する
- command-local fix instructions: plan/compose/polish/deliver ごとの安全な修正境界だけを所有する
- smoke validation: gate が review 前に存在し、非互換 schema や route drift がないことだけを検証する

## Out of Boundary

- 通常 review を AI antipattern review に置き換えない
- `polish` で plan 内容を再設計しない
- `deliver` で visual/layout inspection を再開しない
- gate が人間 approval file を生成しない
- gate が `slides/<deck>` 外の任意 path を修正しない

## Upstream / Downstream

- **Upstream**:
  - `slide-workflow-foundation`: target、state、report freshness、runner preflight
  - `slide-workflow-orchestration`: canonical 4 workflow、report schema、loop monitor 境界
  - `slide-workflow-smoke-validation`: end-to-end validation と integration fix ルール
  - `takt-sdd` の callable AI quality gate pattern
- **Downstream**:
  - 今後の slide workflow smoke run
  - deck 作成時の通常 review/fix loop
  - 将来の repo rename 後の `takt-marp` workflow

## Existing Spec Touchpoints

- **Extends**:
  - なし。既存 spec は完了済みで、この feature は新しい横断 gate として追加する。
- **Adjacent**:
  - `slide-workflow-orchestration`: caller workflow と facets を変更するが、通常 review/fix/supervision の意味論は再定義しない。
  - `slide-workflow-smoke-validation`: smoke validator を拡張するが、smoke spec 内で新しい workflow semantics を隠さない。

## Constraints

- プロジェクト内の spec/設計文書は日本語で書く。
- workflow 実行は `--skip-git` を使う。
- gate は通常 review/inspect/verify の前に配置する。
- AI antipattern はどの workflow でも発生しうるため、4 command 全てに入れる。
- command gate object のような TAKT schema 互換性リスクを workflow YAML に再導入しない。
- report/front matter は既存 parser と output contract で扱える形式にする。
