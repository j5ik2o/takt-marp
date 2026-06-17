# ADR 0001: Slide Workflow Command Model

## Status

Accepted

## Context

旧workflowは `draft`、`review-revise`、`build-qa` をトップレベルコマンドとして公開していた。これらは成果物状態、作業行為、品質保証活動が同じ階層に混ざっており、次の工程がどの状態を前提にしてよいかが曖昧だった。

TAKT workflowの内部では review、fix、loop monitor、supervise を閉じた品質ループとして扱う。ユーザーが実行するコマンドは、外部に公開する成果物状態の遷移を表す必要がある。

## Decision

ユーザー向けコマンドは `plan`、`compose`、`polish`、`deliver` に固定する。

- `plan`: briefを正規化し、deck planを `planned` 状態にする
- `compose`: planからdesign system、SLIDES、SVGを作り `composed` 状態にする
- `polish`: render inspectionとfix loopを閉じて `polished` 状態にする
- `deliver`: requested deliverablesを生成し `delivered` 状態にする

`review`、`revise`、`qa`、`build-qa` はトップレベルコマンドにしない。これらは各TAKT workflow内部のstep/roleとして扱う。

`plan` と `compose` は人間approvalを要求できる。Approval fileはTAKT agentではなく、人間操作の `slide:approve` で生成する。

この決定で固定する「ユーザー向けコマンド」は workflow state command を指す。
`build:html`、`build:pdf`、`build:pptx`、`preview` は state transition ではなく、TAKT workflowを起動しない local utility command として扱う。

## Consequences

- `slide:draft`、`slide:review-revise`、`slide:build-qa` の互換aliasは残さない。
- workflow state command は `slides/<deck>` を唯一のtarget contractにする。`slides/<deck>/brief.md` の直指定は拒否する。
- utility command は `deck`、`slides/<deck>`、`slides/<deck>/SLIDES.md` を受け付けるが、workflow state、review report、approval file は変更しない。
- RunnerはTAKT起動前にtarget、prerequisites、workflow YAML availabilityを検証する。
- 後続 `slide-workflow-orchestration` はこのcommand/state/report contractに合わせてTAKT workflow YAMLとfacetを置き換える。
