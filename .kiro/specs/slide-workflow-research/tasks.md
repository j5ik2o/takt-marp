# 実装計画

- [ ] 1. 基盤: command/state と research domain の土台を作る
- [x] 1.1 Command Config Registry で research command を単一定義源に追加する
  - `research / plan / compose / polish / deliver` の command metadata から既存 exports と validation が派生する状態にする
  - `research` は approval 非対応、successful state `researched`、artifact domain `research`、invalidation target `research` として扱う
  - `plan` の prerequisite は `brief.md` のまま維持し、`research` の state や approval を要求しない
  - 完了条件: unknown command は `research` を含む期待 command list で失敗し、`research` の downstream が research domain だけになる
  - _Requirements:_ 1.1, 1.3, 1.4, 4.2, 4.5
  - _Boundary:_ Command Config Registry
  - _Depends:_ none

- [x] 1.2 research artifact domain の path と supervision 読み取りを分離する
  - `slides/<deck>/research/` を research artifact の入出力先として扱い、既存 `review/` domain と混ぜない
  - `research-supervision.md` は research domain から読み、`state: researched` と既存 count fields を検証できるようにする
  - `research-brief.md`、`research-report.md`、`research-sources.md`、`research-claims.md`、`open-questions.md` の配置を runner/sync が共有できる状態にする
  - 完了条件: `brief.md` や `review/*` を触らずに research domain の supervision と artifact path を解決できる
  - _Requirements:_ 2.1, 2.3, 4.1, 4.2
  - _Boundary:_ Research Supervision Validator, Research Artifact Sync
  - _Depends:_ 1.1

- [x] 1.3 research preflight と built-in workflow availability を runner に追加する
  - `takt-marp research slides/<deck>` は既存 target contract で deck を検証し、TAKT target だけを `slides/<deck>/research/research-brief.md` に変換する
  - `research-brief.md` がない場合は `brief.md` から推測せず、TAKT 起動前に `PREREQUISITE_MISSING` で失敗する
  - wrapper workflow template と TAKT built-in `deep-research` の存在を TAKT 起動前に検証し、不在時は明示 error を返す
  - `.takt/workflow-current-target.json` に `target`、`research_brief_path`、`research_output_dir` を書く
  - 完了条件: valid research では TAKT invocation の target が research brief になり、preflight failure では TAKT が起動しない
  - _Requirements:_ 1.1, 1.2, 2.1, 2.2, 6.1, 6.5
  - _Boundary:_ Workflow Runner
  - _Depends:_ 1.2

- [x] 1.4 research rerun と force invalidation を research domain に閉じる
  - successful `research` は `--force` なしで拒否し、rejected research は同一 command artifacts を退避して再実行できるようにする
  - `research --force` は `slides/<deck>/research/history/` だけへ退避し、既存 `review/` reports や approval を退避しない
  - external research failure は research command の失敗として扱い、既存 successful plan state を変更しない
  - 完了条件: `research --force` 実行後も `review/plan-approval.md` など既存 approval が不変であることを fixture で確認できる
  - _Requirements:_ 4.3, 4.4, 4.5, 4.6, 6.4
  - _Boundary:_ Workflow Runner, Command Config Registry
  - _Depends:_ 1.3

- [ ] 2. コア: built-in deep research を deck-local artifact に接続する
- [x] 2.1 Research Workflow Wrapper を追加する
  - `kind: workflow_call` と `call: deep-research` で built-in research workflow を呼ぶ wrapper を追加する
  - wrapper は `deep_research` call、adapter、supervision だけを所有し、built-in persona/policy/output contract を repo-local にコピーしない
  - web access の許可は built-in workflow 内に閉じ、通常 slide workflow へ広げない
  - 完了条件: workflow YAML inspection で `call: deep-research` が確認でき、repo-local に built-in research facets の複製が存在しない
  - _Requirements:_ 3.1, 4.1, 6.1, 6.5
  - _Boundary:_ Research Workflow Wrapper
  - _Depends:_ 1.3

- [x] 2.2 (P) Research Adapter で built-in report から index artifacts を生成する
  - 入力を built-in `research-report.md` のみに限定し、`research-sources.md`、`research-claims.md`、`open-questions.md` を生成する
  - URL、取得日、claim/source 対応、確度が report 内で確認できない場合は `not_present_in_builtin_report` または caveat として表現する
  - 追加調査、外部 fetch、出典再評価、built-in report にない claim 生成を行わない instruction と output を固定する
  - 完了条件: 欠落情報を含む mock report から、補完せずに `not_present_in_builtin_report` を含む artifacts が生成される
  - _Requirements:_ 3.2, 3.3, 3.4, 3.5, 6.3, 6.5
  - _Boundary:_ Research Adapter
  - _Depends:_ 2.1

- [x] 2.3 (P) research supervision output と validator を researched state に対応させる
  - wrapper の supervision が `command: research`、`target: slides/<deck>`、`state: researched`、`result`、finding counts を flat front matter で出す
  - validator は passed research で `state: researched` を要求し、rejected research は rerun 判定に使えるようにする
  - adapter/supervision は handoff marker を読み、research brief target と user-facing target を混同しない
  - 完了条件: `research-supervision.md` の passed/rejected fixture が validator で期待どおり判定される
  - _Requirements:_ 4.1, 4.2, 4.6
  - _Boundary:_ Research Supervision Validator
  - _Depends:_ 2.1

- [x] 2.4 Research Artifact Sync と source report locator を実装する
  - selected parent reports directory の内側だけから built-in `research-report.md` を探索し、`workflow-deep-research` subworkflow を優先する
  - `research-report.md` は built-in output を byte-for-byte copy し、adapter output で置き換えない
  - adapter outputs と `research-supervision.md` を `slides/<deck>/research/` に atomic replace で同期する
  - source report が 0 件または複数件の場合は、それぞれ明示 error で同期を拒否する
  - 完了条件: current run の report だけが research domain に同期され、stale または ambiguous report は同期されない
  - _Requirements:_ 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 6.3, 6.5
  - _Boundary:_ Research Artifact Sync
  - _Depends:_ 2.2, 2.3

- [ ] 3. 統合: CLI、template、plan optional context を接続する
- [x] 3.1 Template Distribution で bundled/ejected research assets を配布する
  - research workflow と adapter instruction を template sync 対象に追加し、built-in research facets は配布対象に含めない
  - bundled source と ejected source の両方で `takt-marp-slide-research.yaml` が解決できるようにする
  - `takt-marp eject` で research workflow と関連 facet がコピーされ、partial template state は既存 error 規約に従う
  - 完了条件: sync 後の `templates/project/**` と `.takt/**` に research assets が揃い、drift 検証で差分が検出できる
  - _Requirements:_ 7.1, 7.2, 7.3, 7.6
  - _Boundary:_ Template Distribution
  - _Depends:_ 2.1, 2.2

- [x] 3.2 CLI command surface と npm entrypoint に research を追加する
  - help に `research` を任意の事前調査 command として既存 workflow command と区別して表示する
  - global CLI から bundled/ejected workflow path を解決し、runner へ `--workflow-file` と provider option を渡す
  - `package.json` に `slide:research` を追加し、既存 scripts 名は変えない
  - 完了条件: CLI help、unknown command error、`slide:research` entrypoint が research を public command として確認できる
  - _Requirements:_ 1.1, 1.5, 7.1, 7.2
  - _Boundary:_ CLI
  - _Depends:_ 1.3, 3.1

- [x] 3.3 (P) Plan Optional Context で research artifacts を任意入力として扱う
  - `plan` は `brief.md` を primary input として維持し、research artifacts がない deck でも従来どおり進む
  - `research-report.md`、`research-claims.md`、`open-questions.md` がある場合だけ追加文脈として読み、research 由来の根拠を識別できる形で出力する
  - `open-questions.md` は未解決前提または保留として扱い、推測で埋めない
  - `plan` の成功条件に外部 web access を追加しない
  - 完了条件: research あり/なし両方の plan fixture で、prerequisite と生成 artifact の挙動が期待どおりになる
  - _Requirements:_ 2.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.2
  - _Boundary:_ Plan Optional Context
  - _Depends:_ 2.4

- [x] 3.4 workflow/report docs を research 契約と同期する
  - workflow docs に research の任意性、`research-brief.md`、built-in report 正本、plan optional context を記述する
  - report docs に `research-supervision.md` と research artifacts の front matter / sync contract を記述する
  - CLI help と docs の command surface が矛盾しない状態にする
  - 完了条件: docs から research の入力、出力、再実行、plan 連携、外部調査境界が確認できる
  - _Requirements:_ 1.5, 2.1, 3.1, 4.1, 5.2, 6.1
  - _Boundary:_ Plan Optional Context, Research Artifact Sync
  - _Depends:_ 3.2, 3.3

- [ ] 4. 検証: deterministic validation と smoke を追加する
- [x] 4.1 foundation validation に research command 境界を追加する
  - command registry、research prerequisite、TAKT target 変換、handoff marker、built-in workflow 不在 preflight を検証する
  - `research --force` が research history だけを退避し、review/approval を触らないことを検証する
  - source report locator の正常、0 件、複数件を fixture で検証する
  - bundled/ejected workflow path の解決と partial state の失敗を検証する
  - 完了条件: foundation validation が research 境界違反を path または error code 付きで失敗させる
  - _Requirements:_ 1.2, 2.1, 2.2, 4.3, 4.4, 4.5, 6.5, 7.1, 7.2, 7.4
  - _Boundary:_ Validation Surface
  - _Depends:_ 1.4, 2.4, 3.1

- [x] 4.2 smoke validation に research と既存 4 command の回帰を追加する
  - mock provider で research が `research-supervision.md` と research artifacts を `slides/<deck>/research/` に同期することを確認する
  - built-in `research-report.md` が byte-for-byte で同期され、adapter output で置換されないことを確認する
  - report の欠落情報が `not_present_in_builtin_report` として残り、補完や追加調査が行われないことを確認する
  - research あり/なしの `plan` と既存 `plan / compose / polish / deliver` の成功経路を確認する
  - 完了条件: smoke validation が research 追加後も既存 4 command path を green のまま維持する
  - _Requirements:_ 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 5.1, 5.2, 5.3, 5.4, 5.5, 7.5
  - _Boundary:_ Validation Surface
  - _Depends:_ 3.3, 4.1

- [x] 4.3 (P) template validation と package boundary で research 配布を固定する
  - `.takt/workflows/takt-marp-slide-research.yaml` と `templates/project/workflows/takt-marp-slide-research.yaml` の drift を検出する
  - ejected templates に research wrapper と adapter instruction が含まれることを検証する
  - built-in research facets が `templates/project/facets/**` にコピーされていないことを検証する
  - 完了条件: template drift、eject 欠落、built-in facet 複製がいずれも validation failure になる
  - _Requirements:_ 6.5, 7.3, 7.6
  - _Boundary:_ Template Distribution, Validation Surface
  - _Depends:_ 3.1

- [ ] 5. 仕上げ: 全体回帰と実装境界を確認する
- [x] 5.1 research feature 全体の regression を実行する
  - foundation validation、smoke validation、template drift validation、package boundary validation を実行する
  - 失敗が出た場合は該当境界の実装タスクへ戻して直し、検証タスク側で期待値を緩めない
  - 完了条件: research command、plan optional context、template distribution、既存 4 command の主要回帰がすべて exit 0 で完走する
  - _Requirements:_ 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
  - _Boundary:_ 統合検証
  - _Depends:_ 4.2, 4.3

- [x] 5.2 scope boundary と residual risk を確認する
  - `research` 追加で `compose / polish / deliver` の prerequisite、approval、supervision contract が変わっていないことを確認する
  - external web access が research command 内に閉じ、通常 workflow の成功条件に広がっていないことを確認する
  - git diff で `.coderabbit.*`、provider 設定、runtime state、認証情報が変更されていないことを確認する
  - 完了条件: scope 外変更が 0 件で、残リスクがあれば implementation notes または PR description に限定的に記録できる
  - _Requirements:_ 1.4, 4.5, 6.1, 6.2, 6.4, 6.5, 7.5
  - _Boundary:_ 統合検証
  - _Depends:_ 5.1

## Implementation Notes

- `research-report.md` は built-in `deep-research` の output が正本であり、adapter は派生 index だけを生成する。
- `research` の user-facing target は常に `slides/<deck>` のままにし、TAKT target だけを `slides/<deck>/research/research-brief.md` に変換する。
- validation では research domain と existing review domain の非干渉を最優先で固定する。
