# 実装計画

- [x] 1. docs と schema の foundation を固める
  - [x] 1.1 command/state decision を ADR と workflow docs に反映する
    - `plan / compose / polish / deliver` を正規 command として説明する。
    - `slides/<deck>` target contract と `brief.md` 直指定拒否を明記する。
    - approval は `plan` と `compose` の人間記録であり、TAKT workflow agent が生成しないことを明記する。
    - 旧 `slide:draft`、`slide:review-revise`、`slide:build-qa`、top-level `qa` が正規 entrypoint ではないことが docs から確認できる。
    - _Requirements:_ 1.1, 1.2, 1.4, 3.6_
    - _Boundary:_ DocsSchema

  - [x] 1.2 report と approval の front matter schema docs を追加する
    - supervision、approval、loop monitor、finding、failure reason、archive naming を日本語 docs として定義する。
    - state check が読む必須 field と optional field の境界を明記する。
    - supervision schema には `command`、`target`、`generated_at`、`workflow_run_id`、`step`、`state`、`result`、finding counts、approval requirement が含まれる。
    - approval schema には `status`、`command`、`target`、`approved_state`、`supervision_workflow_run_id`、`approved_by`、`approved_at`、`waivers`、`decisions` が含まれ、approval 自体の `generated_at` と `workflow_run_id` は要求しない。
    - finding schema には stable `finding_id`、severity/status enum、cycle が含まれる。
    - loop monitor contract は TAKT `loop_monitors` の `cycle`、`threshold`、`judge` として扱われ、fix report の必須 field と混同しない。
    - docs だけで後続 workflow output contract が満たすべき front matter が分かる。
    - _Requirements:_ 2.1, 2.2, 2.3, 2.4, 2.5, 3.6_
    - _Boundary:_ DocsSchema

- [x] 2. shared deterministic library を追加する
  - [x] 2.1 target resolution と documented front matter parser を実装する
    - `slides/<deck>` だけを valid target として解決する。
    - `slides/<deck>/brief.md`、Markdown file、`slides/` 外 path は actionable error として表現する。
    - front matter parser は documented subset を parse し、unsupported syntax を silent success にしない。
    - 新規 package dependency なしで parser の基本ケースを検証できる。
    - _Requirements:_ 1.1, 1.2, 2.1, 2.6, 6.2_
    - _Boundary:_ SlideWorkflowLibrary, TargetResolver, FrontMatterParser

  - [x] 2.2 supervision と approval の state validator を実装する
    - supervision report の `command`、`target`、`workflow_run_id`、`step`、`state`、`result` を検証する。
    - required state と approval の組み合わせを `command:state:approved` として判定できる。
    - approval file の `status: approved`、対象 command、approved timestamp、参照 supervision workflow_run_id を検証する。
    - supervision の `generated_at` と approval の `approved_at` は ISO 8601 として parse 必須にし、時間経過だけでは stale と判定しない。
    - missing、不一致、rejected の各ケースで期待 path と期待 field を含む error を返す。
    - approval の `supervision_workflow_run_id` が canonical passed supervision の `workflow_run_id` と一致しない stale approval を成功扱いしない。
    - validation result を state check、approval script、runner から再利用できる。
    - _Requirements:_ 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 6.2_
    - _Boundary:_ SlideWorkflowLibrary, StateValidator

  - [x] 2.3 archive と generated output cleanup helper を実装する
    - rejected rerun 用と force invalidation 用の history archive を区別できる。
    - canonical reports と approval files を必要な場面で history に移せる。
    - stale `dist/<deck>/` と `.takt/render/<deck>/` を clean できる。
    - source artifacts は cleanup helper の削除対象にならないことが検証できる。
    - _Requirements:_ 4.3, 4.4, 4.5, 5.4_
    - _Boundary:_ SlideWorkflowLibrary, ReportArchive, GeneratedOutputCleaner

- [x] 3. check-state と approval CLI を追加する
  - [x] 3.1 `slide:check-state` 用 CLI を実装する
    - `<target> --require <command>:<state>[:approved]` を受け付ける。
    - `plan:planned:approved`、`compose:composed:approved`、`polish:polished` の主要 require を検証できる。
    - invalid state では non-zero exit と actionable message を返す。
    - TAKT workflow は起動せず、front matter だけで判定する。
    - _Requirements:_ 3.1, 3.2, 6.1, 6.2_
    - _Boundary:_ StateCheckScript

  - [x] 3.2 `slide:approve` 用 CLI を実装する
    - `plan` と `compose` だけを approval 対象として許可する。
    - `--by` を必須にし、missing 時は approval file を作らない。
    - matching supervision が `result: passed` の場合だけ approval file を生成する。
    - `polish` と `deliver` は拒否され、既存 approval は `--force` なしで上書きされない。
    - _Requirements:_ 3.3, 3.4, 3.5, 3.6, 6.1_
    - _Boundary:_ ApprovalScript, ApprovalRecorder

- [x] 4. workflow runner と render evidence foundation を追加する
  - [x] 4.1 command runner の preflight と TAKT invocation を実装する
    - `plan`、`compose`、`polish`、`deliver` と `slides/<deck>` target を受け付ける。
    - command prerequisites を TAKT 起動前に検証する。
    - `.takt/workflows/takt-marp-slide-{command}.yaml` が存在しない場合は、TAKT を起動せず未実装 workflow と expected path を示す error で失敗する。
    - preflight failure では `./node_modules/.bin/takt` を起動しない。
    - valid preflight 後は `./node_modules/.bin/takt --pipeline --skip-git -w takt-marp-slide-{command} -t slides/<deck>` を起動し、exit code を伝播する。
    - _Requirements:_ 4.1, 4.6, 4.7, 6.1_
    - _Boundary:_ WorkflowRunner

  - [x] 4.2 runner の rerun protection と force invalidation を実装する
    - successful state の再実行は `--force` なしで拒否する。
    - rejected supervision の再実行は `--force` なしで許可し、既存 command reports を archive する。
    - `--force` は対象 command 以降の canonical reports/approvals を archive する。
    - `--force` 後の cleanup で generated outputs は消えるが、source artifacts は残る。
    - _Requirements:_ 4.2, 4.3, 4.4, 4.5, 6.1_
    - _Boundary:_ WorkflowRunner, ReportArchive, GeneratedOutputCleaner
    - _Depends:_ 2.3, 4.1

  - [x] 4.3 render evidence script の foundation を実装する
    - `slides/<deck>` target と `--cycle <n>` を検証する。
    - `.takt/render/<deck>/cycle-{n}/` を作成し、`metadata.json` を書く。
    - HTML/PNG、PDF、PDF raster の status と degraded reason を metadata に記録できる。
    - `pdftoppm` missing は failure ではなく degraded mode として記録され、`dist/<deck>/` には書かない。
    - _Requirements:_ 5.1, 5.2, 5.3, 5.4_
    - _Boundary:_ RenderEvidenceScript

- [x] 5. npm entrypoint と foundation validation を統合する
  - [x] 5.1 `package.json` の `slide:*` scripts を wrapper scripts に更新する
    - `slide:plan`、`slide:compose`、`slide:polish`、`slide:deliver` が runner script を呼ぶ。
    - `slide:check-state` と `slide:approve` が追加される。
    - foundation validation 用の npm script が追加される。
    - 旧 `slide:draft`、`slide:review-revise`、`slide:build-qa` は scripts から消える。
    - _Requirements:_ 1.1, 1.3, 1.4, 3.1, 3.3, 6.3_
    - _Boundary:_ NpmEntrypoints
    - _Depends:_ 3.1, 3.2, 4.1

  - [x] 5.2 foundation regression validation を追加する
    - invalid target、missing approval、invalid approval command、missing workflow YAML、successful rerun rejection、rejected rerun archive、force invalidation を fixture で検証する。
    - parser と validator が documented subset を判定できることを検証する。
    - `package.json` の `slide:*` scripts が wrapper scripts にそろっていることを検証する。
    - 検証は TAKT workflow YAML/facet の完成や smoke deck の完全実行を必須にしない。
    - _Requirements:_ 6.1, 6.2, 6.3, 6.4_
    - _Boundary:_ FoundationValidation
    - _Depends:_ 5.1

- [x] 6. foundation 全体を実行確認する
  - [x] 6.1 npm scripts 経由で主要 failure path を確認する
    - `npm run slide:check-state -- "slides/my-talk" --require plan:planned:approved` が approval missing 時に actionable message で失敗する。
    - `npm run slide:approve -- "slides/my-talk" polish --by j5ik2o` が approval file を作らずに失敗する。
    - `npm run slide:plan -- "slides/my-talk/brief.md"` が TAKT 起動前に失敗する。
    - validation command が foundation scope の regression を検出できる。
    - _Requirements:_ 1.2, 3.1, 3.2, 3.4, 4.1, 6.1, 6.3_
    - _Boundary:_ NpmEntrypoints, FoundationValidation
    - _Depends:_ 5.2

  - [x] 6.2 scope boundary を確認して後続 spec に引き渡す
    - `.takt/workflows/*.yaml` と `.takt/facets/**/*.md` はこの task set で再編されていない。
    - report schema、approval ownership、runner preflight、force/rerun semantics が docs と scripts で一致している。
    - 後続 `slide-workflow-orchestration` が workflow YAML/facet を実装するときに参照する integration contract が明確になっている。
    - 旧 command 互換 alias が残っていないことを確認できる。
    - _Requirements:_ 1.4, 3.6, 4.6, 5.4, 6.4_
    - _Boundary:_ DocsSchema, NpmEntrypoints, FoundationValidation
    - _Depends:_ 6.1

## Implementation Notes

- `docs/adr/0001-slide-workflow-command-model.md` と `docs/marp-slide-workflow-reports.md` を追加し、command/state、approval ownership、front matter schema、archive naming を固定した。
- `scripts/lib/takt-marp-slide-workflow.mjs` に target resolution、front matter parser、state/approval validation、archive、generated output cleanup を集約した。
- `scripts/takt-marp-run-slide-workflow.mjs` は `.takt/workflows/takt-marp-slide-{command}.yaml` が存在しない場合、TAKT を起動せず `WORKFLOW_NOT_IMPLEMENTED` で失敗する。
- `package.json` は canonical `slide:plan`、`slide:compose`、`slide:polish`、`slide:deliver` と deterministic helper scripts に更新し、旧 `slide:draft`、`slide:review-revise`、`slide:build-qa` を削除した。
- Validation: `npm test`、`npm run slide:validate-foundation`、`npm run slide:smoke`、主要 failure path を実行済み。
