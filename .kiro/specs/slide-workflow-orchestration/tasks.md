# 実装計画

- [x] 0. foundation readiness gate を確認する
  - [x] 0.1 `slide-workflow-foundation` の完了条件を検証する
    - `package.json` の `slide:plan`、`slide:compose`、`slide:polish`、`slide:deliver` が `scripts/takt-marp-run-slide-workflow.mjs` 経由になっていることを確認する。
    - `scripts/takt-marp-run-slide-workflow.mjs`、`scripts/takt-marp-check-slide-workflow-state.mjs`、`scripts/takt-marp-approve-slide-workflow-state.mjs`、`scripts/takt-marp-render-slide-workflow-evidence.mjs`、`scripts/takt-marp-validate-slide-workflow-foundation.mjs` が存在することを確認する。
    - foundation validation command が成功し、runner/state/approval/render evidence/schema docs の契約が現在の worktree で使えることを確認する。
    - gate が満たされない場合は orchestration 実装へ進まず、`slide-workflow-foundation` を先に完了または是正する。
    - _Requirements:_ 3.3, 3.7, 4.2, 4.3, 6.1_
    - _Boundary:_ WorkflowDefinitionSet, TaktWorkflowValidation_

- [x] 1. canonical workflow surface の土台を作る
  - [x] 1.1 workflow name と旧 workflow 削除範囲を確定する
    - 4つの canonical workflow file 名が `takt-marp-slide-plan`、`takt-marp-slide-compose`、`takt-marp-slide-polish`、`takt-marp-slide-deliver` にそろう。
    - 旧 `takt-marp-slide-draft`、`takt-marp-slide-review-revise`、`takt-marp-slide-build-qa` は alias なしで削除対象として扱われる。
    - `.takt/workflows/` を見たときに実行可能な slide workflow が canonical 4本だけであることを確認できる。
    - _Requirements:_ 1.1, 1.2, 1.3, 4.4, 6.2_
    - _Boundary:_ WorkflowDefinitionSet, OldWorkflowRemoval_

  - [x] 1.2 shared workflow naming conventions を既存 plan workflow に反映する
    - `takt-marp-slide-plan` の step name が snake_case で統一される。
    - plan workflow の report 名が `plan-work.md`、`plan-review.md`、`plan-fix.md`、`plan-supervision.md` の canonical family へそろう。
    - `intake`、`normalize_brief`、`plan_deck` は同じ `plan-work.md` を重複出力せず、`summarize_plan_work` だけが canonical work report を出力する。
    - plan workflow が work、review、fix、supervision を内部 step として持ち、反復監視を TAKT `loop_monitors` で定義することを YAML 上で確認できる。
    - `plan.md` が `deliverables: [html|pdf|pptx]` を authoritative delivery request として記録する。
    - _Requirements:_ 1.4, 2.1, 3.1, 3.6, 4.1_
    - _Boundary:_ PlanWorkflow, WorkflowLoopTopology_

- [x] 2. canonical report output contract family を整備する
  - [x] 2.1 work/review/fix report contracts を統合する
    - work step、review/inspect/verify step、fix step が共有する front matter field と Markdown body の構造を定義する。
    - 既存の plan、design-system、review、revision-log、visual-fix-log 系 contract は canonical family へ統合または thin wrapper 化される。
    - workflow から参照される report contract だけを残し、古い contract が孤立して残らないことを確認できる。
    - _Requirements:_ 4.1, 5.5, 6.3_
    - _Boundary:_ CommandReportContracts_

  - [x] 2.2 loop monitor 設定と supervision report contracts を追加する
    - loop monitor は deck-local report contract を持たず、TAKT `loop_monitors` の `cycle`、`threshold`、`judge` として定義される。
    - supervision contract が foundation の `command`、`step: supervision`、`state`、`result`、finding counts、approval requirement と一致する。
    - `plan-supervision.md`、`compose-supervision.md`、`polish-supervision.md`、`deliver-supervision.md` が同じ supervision contract を参照する。
    - _Requirements:_ 2.3, 2.4, 4.2, 4.3, 5.5_
    - _Boundary:_ LoopMonitorConfig, SupervisionReportContract, CommandReportContracts_

- [x] 3. facet persona と policy の責務を分離する
  - [x] 3.1 slide supervisor persona と loop monitor 設定を追加する
    - `takt-marp-slide-supervisor` は詳細 review を再実施せず、成果物境界、report schema、未解消 finding、approval ownership を検証する役割として定義される。
    - loop monitoring は dedicated local persona ではなく TAKT `loop_monitors` と built-in `loop-monitor-reviewers-fix` instruction に委ねる。
    - persona facet には `{extends:<parent>}` が使われていないことを確認できる。
    - _Requirements:_ 2.3, 2.4, 5.2, 5.4_
    - _Boundary:_ PersonaSet, LoopMonitorConfig, SupervisionFacet_

  - [x] 3.2 slide/Marp/SVG/worker boundary policy を整理する
    - `takt-marp-general-slide-quality`、`takt-marp-slide-quality`、`takt-marp-svg-first-visual`、`takt-marp-worker-boundary` の責務が重複しないように分離される。
    - Marp Markdown/front matter 制約は `takt-marp-slide-quality`、SVG-first の visual 制約は `takt-marp-svg-first-visual`、git/approval 禁止は `takt-marp-worker-boundary` で確認できる。
    - 利用可能な built-in policy には `{extends:qa}`、`{extends:design-fidelity}`、`{extends:coding}` のような bare name extends が適用される。
    - _Requirements:_ 3.5, 5.1, 5.3_
    - _Boundary:_ PolicySet, BuiltInExtendsAdoption_

- [x] 4. compose workflow を追加する
  - [x] 4.1 compose work steps を定義する
    - `design_system`、`compose_slides`、`generate_visuals` が `design-system.md`、`SLIDES.md`、`images/*.svg` を作る work steps として定義される。
    - compose workflow は render output を成功条件に含めない。
    - `design_system`、`compose_slides`、`generate_visuals` は同じ `compose-work.md` を重複出力せず、`summarize_compose_work` だけが canonical work report を出力する。
    - `compose-work.md` から作成・変更された compose source artifacts を確認できる。
    - _Requirements:_ 2.1, 3.2, 4.1_
    - _Boundary:_ ComposeWorkflow, InstructionSet_

  - [x] 4.2 compose review/fix/loop/supervision を閉じる
    - compose review は content、flow、visual source の finding を `compose-review.md` に記録する。
    - compose fix は review finding だけを source artifacts に反映し、`compose-fix.md` に対応結果を記録する。
    - TAKT `loop_monitors` が compose の review/fix/work-summary cycle を監視し、非生産的な反復時に `ABORT` へ進むことを YAML 上で確認できる。
    - `compose-supervision.md` が foundation schema に合う final report として出力される。
    - _Requirements:_ 2.1, 2.2, 2.3, 2.4, 3.2, 4.2, 4.3_
    - _Boundary:_ ComposeWorkflow, WorkflowLoopTopology_

- [x] 5. polish workflow を追加する
  - [x] 5.1 render evidence inspection step を定義する
    - polish workflow は `render_evidence` step で foundation の `scripts/takt-marp-render-slide-workflow-evidence.mjs` を呼ぶ。
    - `render_evidence` step は `.takt/render/<deck>/cycle-{n}/metadata.json` を生成し、`polish-work.md` に実行結果を記録する。
    - `render_evidence` step は command gate または同等の機械検証で `metadata.json` の存在、target、cycle、HTML/PDF status、degraded reason schema を検証し、missing/invalid の場合は `inspect_render` に進まない。
    - `inspect_render` は visual/layout/render finding を `polish-inspect.md` に記録する。
    - inspection instruction が plan-level content の変更要求を出さないことを確認できる。
    - _Requirements:_ 2.1, 3.3, 4.1, 6.4_
    - _Boundary:_ PolishWorkflow, InstructionSet_

  - [x] 5.2 polish fix/loop/supervision を閉じる
    - polish fix は `design-system.md`、`SLIDES.md`、`images/*.svg` の visual/layout/render/design-token 関連修正だけを扱う。
    - TAKT `loop_monitors` が polish の inspect/fix/render-evidence cycle を監視し、非生産的な反復時に supervision 成功へ進まない。
    - `polish-supervision.md` が render evidence、修正範囲、未解消 finding を検証した final report として出力される。
    - _Requirements:_ 2.2, 2.3, 2.4, 3.3, 4.2, 4.3_
    - _Boundary:_ PolishWorkflow, WorkflowLoopTopology_

- [x] 6. deliver workflow を追加する
  - [x] 6.1 delivery build と verification steps を定義する
    - `build_delivery` は `dist/<deck>/` の official artifacts を作る work step として定義される。
    - `build_delivery` は export 前に `dist/<deck>/` を clean する。
    - `build_delivery` は command gate または同等の機械検証で `dist/<deck>/` の pre-clean と `plan.md` の `deliverables` に対応する official artifacts だけが生成されたことを確認する。
    - `verify_delivery` は official artifacts の存在、読み取り可能性、metadata/report 整合、不要 artifact の absence を確認する。
    - deliver workflow に visual inspection step が含まれていないことを YAML と instruction から確認できる。
    - _Requirements:_ 2.1, 3.4, 3.7, 4.1_
    - _Boundary:_ DeliverWorkflow, InstructionSet_

  - [x] 6.2 delivery fix/loop/supervision を閉じる
    - delivery fix は delivery verification finding だけを扱い、visual/layout の再評価を要求しない。
    - TAKT `loop_monitors` が delivery の verify/fix/build cycle を監視し、非生産的な反復時に supervision 成功へ進まない。
    - `deliver-supervision.md` が `dist/<deck>/` の final delivery contract を検証した report として出力される。
    - _Requirements:_ 2.2, 2.3, 2.4, 3.4, 4.2, 4.3_
    - _Boundary:_ DeliverWorkflow, WorkflowLoopTopology_

- [x] 7. built-in extends と facet 参照を仕上げる
  - [x] 7.1 instruction/output contract の built-in extends を適用する
    - local instruction のうち汎用 fix、supervision mechanics は利用可能な built-in facet を bare name で extends し、loop monitoring は TAKT `loop_monitors` で built-in instruction を参照する。
    - output contract のうち validation/supervision の汎用構造は built-in contract を候補にし、Marp 固有 front matter 差分だけを local に残す。
    - path reference、`@scope` reference、persona extends が使われていないことを確認できる。
    - _Requirements:_ 5.1, 5.2, 5.5_
    - _Boundary:_ BuiltInExtendsAdoption, InstructionSet, CommandReportContracts_

  - [x] 7.2 canonical workflows から参照されない旧 facet を整理する
    - canonical 4 workflows の persona、policy、instruction、knowledge、output contract 参照がすべて存在する。
    - 旧 `draft`、`review-revise`、`build-qa` 専用 facet は参照グラフ確認後に削除または canonical 名へ統合される。
    - 削除した facet が canonical workflows から参照されていないことを検証できる。
    - _Requirements:_ 5.3, 5.5, 6.3_
    - _Boundary:_ FacetPromptSet, TaktWorkflowValidation_

- [x] 8. orchestration 静的検証を実行する
  - [x] 8.1 TAKT workflow schema と参照解決を検証する
    - 4つの canonical workflow YAML が TAKT の workflow schema と rule routing に合うことを確認する。
    - workflow が参照する facet path がすべて解決できることを確認する。
    - step name、workflow name、report name の命名制約違反がないことを確認する。
    - 同一 workflow 内で同じ canonical report name が複数 step から出力されないことを確認する。
    - `render_evidence`、`build_delivery`、`verify_delivery` に command gate または同等の機械検証があり、成果物 missing 時に次 step へ進まないことを確認する。
    - _Requirements:_ 1.1, 1.4, 4.1, 6.1, 6.3_
    - _Boundary:_ TaktWorkflowValidation_

  - [x] 8.2 scope boundary と smoke handoff を確認する
    - `scripts/`、`package.json`、`slides/**` がこの task set で変更されていないことを確認する。
    - smoke deck の完全 end-to-end 実行や render 品質の収束修正が未実施の後続 spec 範囲として残っていることを確認する。
    - 旧 workflow files が `.takt/workflows/` に残っておらず、互換 alias も追加されていないことを確認する。
    - Boundary note: `scripts/` と `package.json` の差分は task 0.1 の foundation readiness repair に属し、orchestration workflow/facet 再編では変更していない。
    - _Requirements:_ 1.2, 1.3, 3.5, 6.2, 6.4_
    - _Boundary:_ ValidationBoundary, OldWorkflowRemoval_
