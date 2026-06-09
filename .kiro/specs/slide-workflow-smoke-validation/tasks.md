# 実装計画

- [ ] 1. smoke fixture と validation entrypoint の土台を作る
  - [x] 1.1 smoke fixture の実行案内を canonical sequence に更新する
    - fixture README が `slides/<deck>` target と `plan / compose / polish / deliver` の sequence を案内する。
    - README から旧 `brief.md` target、`draft`、`review-revise`、`build-qa` の実行手順が消えている。
    - fixture の source artifact と generated evidence/artifact の違いが実行手順から確認できる。
    - _Requirements: 1.1, 1.2, 1.3_
    - _Boundary:_ SmokeDeckFixture

  - [x] 1.2 smoke validation CLI の setup と summary 出力を追加する
    - fixture から clean な `slides/_workflow-smoke` target を作成できる。
    - 実行した checks、commands、observed paths、失敗理由を `slides/<deck>/review/smoke-summary.md` として確認できる。
    - smoke target の generated output を再実行可能な状態に戻せる。
    - _Requirements: 1.1, 1.3, 2.3, 8.4_
    - _Boundary:_ SmokeDeckSetup, SmokeRunner, SmokeResultReporter

  - [x] 1.3 npm script から smoke validation を起動できるようにする
    - repository の scripts 一覧から smoke validation 用 entrypoint を確認できる。
    - entrypoint は smoke validation CLI を呼び、通常の `slide:*` command semantics を変更しない。
    - entrypoint 失敗時は validation CLI の non-zero exit が npm script に伝播する。
    - _Requirements: 2.1, 8.4_
    - _Boundary:_ SmokeRunner

- [ ] 2. preflight と approval の failure path を検証する
  - [x] 2.1 invalid target rejection を smoke validation に追加する
    - `slides/_workflow-smoke/brief.md`、Markdown file、`slides/` 外 path が command target として拒否される。
    - 各 invalid target check で TAKT が起動していないことを観測できる。
    - failure message から期待 target が `slides/<deck>` であることを確認できる。
    - _Requirements: 3.1, 3.4_
    - _Boundary:_ PreflightAssertions

  - [x] 2.2 missing approval preflight を smoke validation に追加する
    - plan approval が無い状態の `compose` が TAKT 起動前に失敗する。
    - compose approval が無い状態の `polish` が TAKT 起動前に失敗する。
    - stale report だけでは approved state として扱われないことを確認できる。
    - stale approval の `supervision_workflow_run_id` が canonical supervision と一致しない場合に TAKT 起動前に失敗する。
    - _Requirements: 3.2, 3.3, 3.4, 3.5_
    - _Boundary:_ PreflightAssertions, ReportAssertions

  - [x] 2.3 approval command の negative path を smoke validation に追加する
    - `--by` なしの approval が approval file を作らず失敗する。
    - `polish` と `deliver` への approval が approval file を作らず失敗する。
    - negative path 実行後も後続 sequence に使う approval state が汚染されていない。
    - _Requirements: 4.2, 4.3_
    - _Boundary:_ ApprovalFlowAssertions

- [ ] 3. canonical sequence と report contract を検証する
  - [x] 3.1 plan command と plan approval を smoke sequence に組み込む
    - `slide:plan` が smoke deck に対して `plan-supervision.md` を生成する。
    - plan supervision が `state: planned` と `result: passed` を持つことを確認できる。
    - `slide:approve plan --by ...` によって plan approval file が生成される。
    - workflow 実行だけでは approval file が生成されないことを確認できる。
    - _Requirements: 2.1, 4.1, 4.4, 5.1_
    - _Boundary:_ SmokeRunner, ApprovalFlowAssertions, ReportAssertions

  - [x] 3.2 compose command と compose approval を smoke sequence に組み込む
    - plan approval 後に `slide:compose` が実行され、compose source artifacts と `compose-supervision.md` を確認できる。
    - compose supervision が `state: composed` と `result: passed` を持つことを確認できる。
    - `slide:approve compose --by ...` によって compose approval file が生成される。
    - invalid front matter、stale supervision、stale approval を注入した場合に state validation が失敗する。
    - _Requirements: 2.1, 4.1, 5.1, 5.4_
    - _Boundary:_ SmokeRunner, ApprovalFlowAssertions, ReportAssertions

  - [x] 3.3 polish command と convergence contract を smoke sequence に組み込む
    - compose approval 後に `slide:polish` が実行され、`polish-supervision.md` を確認できる。
    - polish supervision が `state: polished` と `result: passed` を持つことを確認できる。
    - workflow YAML の `loop_monitors` が実際の review/fix cycle を監視し、非生産的な反復時に `ABORT` へ向くことを validation で確認できる。
    - dedicated local loop monitor step や loop monitor facet が残っていないことを確認できる。
    - _Requirements: 2.1, 5.2, 5.3, 5.4_
    - _Boundary:_ SmokeRunner, ReportAssertions, ConvergenceAssertions

  - [x] 3.4 deliver command と delivered state を smoke sequence に組み込む
    - `slide:deliver` が実行され、`deliver-supervision.md` と `dist/_workflow-smoke/` を確認できる。
    - deliver supervision が `state: delivered` と `result: passed` を持つことを確認できる。
    - final state が supervision report と delivery artifact の両方から確認できる。
    - _Requirements: 2.1, 2.2, 5.2, 6.3_
    - _Boundary:_ SmokeRunner, ReportAssertions, DeliveryArtifactAssertions

- [x] 4. render evidence と delivery artifact の境界を検証する
  - [x] 4.1 render evidence assertions を追加する
    - `polish` 後に `.takt/render/_workflow-smoke/` 配下の evidence root と metadata を確認できる。
    - HTML PNG evidence が失敗した場合は smoke failure として扱われる。
    - `pdftoppm` が無い場合は degraded evidence として metadata に記録され、必須 failure と区別される。
    - _Requirements: 6.1, 6.2_
    - _Boundary:_ RenderEvidenceAssertions

  - [x] 4.2 delivery artifact assertions を追加する
    - `deliver` 前に `dist/_workflow-smoke/` の stale artifact が clean されることを確認できる。
    - `plan.md` の `deliverables` に列挙された artifacts が `dist/_workflow-smoke/` に生成され、読み取り可能であることを確認できる。
    - `.takt/render/_workflow-smoke/` の evidence が official delivery artifact として数えられていない。
    - _Requirements: 6.3, 6.4_
    - _Boundary:_ DeliveryArtifactAssertions, SmokeArtifactBoundary

- [x] 5. rerun、force、history archive を検証する
  - [x] 5.1 successful rerun rejection を smoke validation に追加する
    - successful state 到達済み command の再実行が `--force` なしで拒否される。
    - 拒否時に TAKT が起動していないことを観測できる。
    - 拒否結果が既存 supervision や approval file を変更していないことを確認できる。
    - _Requirements: 7.1_
    - _Boundary:_ RerunForceAssertions

  - [x] 5.2 rejected rerun archive を smoke validation に追加する
    - `result: rejected` の canonical supervision を持つ command が `--force` なしで rerun 可能であることを確認できる。
    - rerun 前の rejected report が `review/history/` に archive される。
    - archive 後の rerun が新しい canonical report を生成することを確認できる。
    - _Requirements: 7.2_
    - _Boundary:_ RerunForceAssertions

  - [x] 5.3 force invalidation と source retention を smoke validation に追加する
    - `--force` が対象 command 以降の canonical reports と approval files を history へ archive する。
    - `dist/_workflow-smoke/` と `.takt/render/_workflow-smoke/` の stale generated outputs が clean される。
    - `brief.md`、`brief.normalized.md`、`plan.md`、`design-system.md`、`SLIDES.md`、`images/*.svg` などの source artifacts が保持される。
    - _Requirements: 7.3, 7.4_
    - _Boundary:_ RerunForceAssertions, SmokeArtifactBoundary

- [ ] 6. smoke で見つかった integration issue を収束する
  - [ ] 6.1 foundation contract gap を最小修正する
    - smoke failure が target/preflight/approval/rerun/force/render evidence foundation の実装ズレである場合だけ integration fix exception として最小修正する。
    - 修正後、該当 failure path が smoke validation または foundation validation で再現防止される。
    - command/state model、approval ownership、旧 command alias を変更していないことを確認できる。
    - _Requirements: 8.1, 8.2, 8.3_
    - _Boundary:_ IntegrationFixLoop, PreflightAssertions, RerunForceAssertions, RenderEvidenceAssertions

  - [ ] 6.2 orchestration contract gap を最小修正する
    - smoke failure が workflow/facet/report contract/routing の実装ズレである場合だけ integration fix exception として最小修正する。
    - 修正後、canonical report 名、front matter、loop monitor routing、supervision result が smoke validation で確認できる。
    - 新しい workflow semantics や旧 workflow alias を追加していないことを確認できる。
    - _Requirements: 5.1, 5.2, 5.3, 8.1, 8.2, 8.3_
    - _Boundary:_ IntegrationFixLoop, ReportAssertions, ConvergenceAssertions

  - [ ] 6.3 smoke fixture/validation gap を最小修正する
    - smoke failure が fixture setup、`plan.md` deliverables、assertion の過不足に由来する場合だけ修正する。
    - 修正後、fixture から clean な smoke deck を再作成して validation が再実行できる。
    - fixture の更新が smoke criteria に関係しない visual design 改善へ広がっていないことを確認できる。
    - _Requirements: 1.1, 1.3, 8.1, 8.2, 8.4_
    - _Boundary:_ IntegrationFixLoop, SmokeDeckFixture, SmokeDeckSetup

- [ ] 7. smoke validation 全体を実行して完了条件を確認する
  - [ ] 7.1 required smoke checks を一括実行する
    - smoke validation entrypoint が invalid target、approval、canonical sequence、convergence negative path、render evidence、delivery artifact、rerun/force/history を一括で検証する。
    - すべての必須 check が成功した場合に zero exit となる。
    - 失敗時は failing check、command、期待値、観測値、関連 path が summary から確認できる。
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.3, 7.1, 7.2, 7.3, 7.4, 8.4_
    - _Boundary:_ SmokeRunner, SmokeResultReporter

  - [ ] 7.2 scope boundary と upstream feedback を確認する
    - command/state model、approval ownership、旧 command alias、deliverable 種別がこの spec で再定義されていないことを確認する。
    - 上流 spec と矛盾する未解決事項がある場合、smoke result summary に upstream feedback として残る。
    - smoke deck で生成された evidence/artifacts と残存リスクを `slides/<deck>/review/smoke-summary.md` で確認できる。
    - _Requirements: 6.4, 8.2, 8.3, 8.4_
    - _Boundary:_ IntegrationFixLoop, SmokeResultReporter
