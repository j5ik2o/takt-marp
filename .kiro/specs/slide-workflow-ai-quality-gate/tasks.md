# 実装計画

- [x] 1. AI gate report contract と command 境界 instruction を作る
- [x] 1.1 AI gate review report contract を定義する
  - AI review report が target、command、generated_at、workflow_run_id、step、cycle、reviewed_scope、result、finding counts を flat front matter として持つ。
  - body の finding table で stable finding id、family tag、location、issue、required change、evidence を確認できる。
  - first-pass no-issue report が finding count 0 として parse 可能な Markdown になる。
  - _Requirements:_ 2.3, 4.1, 4.5_
  - _Boundary:_ GateReviewContract_

- [x] 1.2 (P) AI gate fix report contract を定義する
  - AI fix report が status、handled finding count、changed file count、remaining context count を flat front matter として持つ。
  - body の finding decision table で fixed、not applicable、requires replan、blocked の判断と evidence を確認できる。
  - `NO_FIX_NEEDED` の場合に finding-level evidence がない report を成功扱いできない contract になっている。
  - _Requirements:_ 3.2, 4.2, 4.4_
  - _Boundary:_ GateFixContract_

- [x] 1.3 AI-specific review instruction を作る
  - current target marker と command work report から reviewed target、command、artifact scope を特定する。
  - hallucinated path/tool/API、unsupported claim、unrequested compatibility、overbroad abstraction、unused generated artifact を AI-specific finding として分類する。
  - ordinary slide content、layout、render、delivery quality finding は AI-specific fabrication または unsupported assumption に由来する場合だけ扱う。
  - target または reviewed scope が特定できない場合、通常 review に進めない outcome を出すことが instruction から確認できる。
  - _Requirements:_ 2.1, 2.4, 2.5_
  - _Boundary:_ GateReviewInstruction_

- [x] 1.4 (P) command-local AI fix instruction を作る
  - AI review report の全 findings を扱い、current command 境界内で直せるものだけを修正対象にする。
  - 安全に直せない finding は `NEED_REPLAN`、必要情報が足りない finding は `BLOCKED` として report できる。
  - approval file を生成せず、`polish` を plan redesign に広げず、`deliver` を visual/layout inspection に広げないことが instruction から確認できる。
  - _Requirements:_ 3.1, 3.3, 5.2, 5.4_
  - _Boundary:_ GateFixInstruction_

- [x] 2. callable AI gate workflow と caller routing を組み込む
- [x] 2.1 internal callable AI gate workflow を追加する
  - AI gate workflow が internal callable subworkflow として呼び出せる。
  - AI review、AI fix、request replan の lifecycle が `COMPLETE`、`need_replan`、`ABORT` に収束する。
  - AI fix loop が非収束の場合に request replan へ進み、通常 review を成功扱いで通過しない。
  - workflow config から external web access が標準成功条件になっていないことを確認できる。
  - _Requirements:_ 1.5, 2.2, 3.1, 3.3, 3.5, 4.5, 5.2, 5.5_
  - _Boundary:_ GateWorkflowDefinition_
  - _Depends:_ 1.1, 1.2, 1.3, 1.4_

- [x] 2.2 plan と compose の caller route を AI gate 経由にする
  - `plan` work success が通常 review へ直行せず AI gate step へ進む。
  - `compose` work success が通常 review へ直行せず AI gate step へ進む。
  - `COMPLETE` はそれぞれ通常 review へ、`need_replan` は owning work summary step へ、`ABORT` は workflow abort へ進む。
  - normal review、normal fix、supervision step が削除または置換されていないことを確認できる。
  - _Requirements:_ 1.1, 1.2, 3.4, 5.1_
  - _Boundary:_ CallerGateRoutes_
  - _Depends:_ 2.1_

- [x] 2.3 polish と deliver の caller route を AI gate 経由にする
  - `polish` render evidence success が inspection へ直行せず AI gate step へ進む。
  - `deliver` build success が verification へ直行せず AI gate step へ進む。
  - `COMPLETE` はそれぞれ inspection/verification へ、`need_replan` は owning work step へ、`ABORT` は workflow abort へ進む。
  - polish/deliver の normal fix と supervision の責務が AI gate に吸収されていないことを確認できる。
  - _Requirements:_ 1.3, 1.4, 3.4, 5.1, 5.4_
  - _Boundary:_ CallerGateRoutes_
  - _Depends:_ 2.1_

- [x] 3. AI gate evidence を runner で deck-local report として同期する
- [x] 3.1 runner の command report sync 対象に AI gate reports を含める
  - current successful run の AI gate review report が `<command>-ai-antipattern-review.md` として deck-local review directory に同期される。
  - current successful run に AI fix report が存在する場合だけ `<command>-ai-antipattern-fix.md` として同期される。
  - current run に存在しない stale deck-local AI gate report が cleanup 対象になる。
  - AI gate report が command successful state の選択条件になっていないことを確認できる。
  - _Requirements:_ 4.3, 5.3, 6.3_
  - _Boundary:_ GateEvidenceSync_
  - _Depends:_ 2.1_

- [x] 3.2 subworkflow report の current-run association を検証可能にする
  - runner が selected successful run に属する AI gate evidence だけを同期する。
  - target、command、workflow_run_id が不一致の AI gate report を current evidence として扱わない。
  - fake TAKT run または synthetic run fixture で AI gate report sync の成功と stale cleanup を確認できる。
  - _Requirements:_ 4.1, 4.2, 4.3, 6.3_
  - _Boundary:_ GateEvidenceSync, GateReportAssertions_
  - _Depends:_ 3.1_

- [x] 4. workflow route と gate report の validation を追加する
- [x] 4.1 gate placement と outcome route の static assertions を追加する
  - 4 canonical workflows すべてで work success route が AI gate step を経由することを validation で確認できる。
  - AI gate `COMPLETE`、`need_replan`、`ABORT` の route が command ごとの expected step に一致する。
  - workflow edit で gate step を削除したり unrelated command boundary へ route したりすると validation が失敗する。
  - _Requirements:_ 6.1, 6.2, 6.4, 6.5_
  - _Boundary:_ GateRouteAssertions_
  - _Depends:_ 2.2, 2.3_

- [x] 4.2 schema compatibility assertions を維持・拡張する
  - AI gate が `kind: workflow_call` として実装され、object-shaped `quality_gates` command gate を使っていないことを validation で確認できる。
  - 既存の string-only quality gate schema regression check が残っている。
  - workflow YAML に unsupported `{task}` interpolation や command gate object が混入した場合に validation が失敗する。
  - _Requirements:_ 5.6_
  - _Boundary:_ GateSchemaAssertions_
  - _Depends:_ 2.1, 4.1_

- [x] 4.3 AI gate report freshness と optional fix rule の assertions を追加する
  - deck-local AI review report の target、command、workflow_run_id が active command run と一致することを validation で確認できる。
  - review report に blocking AI findings がない場合だけ fix report absence が許容される。
  - `NO_FIX_NEEDED` fix report に finding-level evidence がない場合、validation が失敗する。
  - smoke summary または validation output から observed AI gate report paths を確認できる。
  - _Requirements:_ 3.2, 4.3, 4.4, 4.5, 6.3_
  - _Boundary:_ GateReportAssertions_
  - _Depends:_ 3.2_

- [x] 5. task graph を統合検証して完了条件を満たす
- [x] 5.1 foundation validation と smoke static validation を実行する
  - foundation validation が command/state enum と approval ownership を変更していないことを確認できる。
  - smoke validation が gate placement、routing、schema compatibility、AI gate report association を確認する。
  - validation failure 時に対象 command、期待 route/report、観測 route/report、関連 path が出力から分かる。
  - _Requirements:_ 5.1, 5.2, 5.3, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5_
  - _Boundary:_ GateRouteAssertions, GateReportAssertions, GateSchemaAssertions_
  - _Depends:_ 4.1, 4.2, 4.3_

- [x] 5.2 AI gate を含む command smoke path を確認する
  - 少なくとも synthetic smoke path で AI gate review report が生成され、deck-local report として同期される。
  - first-pass no-issue の場合に optional fix report がなくても gate completion と normal review continuation が成立する。
  - AI gate が user-facing top-level command として追加されていないことを確認できる。
  - _Requirements:_ 1.5, 2.2, 4.5, 6.3_
  - _Boundary:_ GateWorkflowDefinition, GateEvidenceSync, GateReportAssertions_
  - _Depends:_ 5.1_

- [x] 5.3 scope boundary と residual risk を確認する
  - `COMMANDS`、`COMMAND_STATES`、approval command set、`slide:*` user-facing command surface が変更されていないことを確認できる。
  - `polish` と `deliver` の通常責務が AI gate instruction や route で拡張されていないことを確認できる。
  - TAKT subworkflow report layout に未解決の差分がある場合、実装を完了扱いせず design/tasks に戻す判断材料が残る。
  - _Requirements:_ 5.1, 5.2, 5.3, 5.4, 5.5_
  - _Boundary:_ GateWorkflowDefinition, CallerGateRoutes, GateEvidenceSync_
  - _Depends:_ 5.2_
