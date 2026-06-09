# Brief

## Event
- Name: takt-sdd with cc-sdd v3
- Date: 2026-06-10
- Duration: 12:30~12:58(28 minutes)
- Venue: Online
- Audience: Developers and maintainers familiar with cc-sdd / Kiro-style SDD concepts, but not yet familiar with takt-sdd workflow internals.

## Goal
聴衆に、takt-sdd が cc-sdd v3 の手順を実行するだけでなく、spec 生成から実装完了判定までを、TAKT の状態遷移・read-only validation・AI quality gate・並行 review で運用可能な品質管理プロセスにしていることを理解してもらう。

## Core Message
takt-sdd は cc-sdd v3 の Kiro-style SDD を、TAKT の決定論的 workflow と品質ゲートで、spec 生成から実装完了判定まで運用可能にする。

## Audience Context
聴衆は cc-sdd / Kiro-style SDD の概念をある程度知っている開発者・メンテナである。SDD の一般論ではなく、takt-sdd が cc-sdd v3 対応で何を TAKT workflow 化し、どの品質リスクをどこで止めるかを知りたい。

`takt-marp` はこの deck を生成するための手段であり、発表の主題ではない。主題は `takt-sdd` の cc-sdd v3 対応、Kiro-compatible workflow、品質ゲート、実装完了判定である。

## Required Topics
- なぜ takt-sdd か: cc-sdd v3 を呼ぶだけでは、実行順序、レビュー境界、完了判定、証跡確認が会話任せになりやすい。
- TAKT による決定論的 workflow 化: `kiro:*` surface、YAML state machine、phase gate、parseable output contract により、AI の自由会話ではなく workflow の状態遷移として進める。
- Kiro shared contract: status、validation、review、debug、completion を machine-readable にし、`.kiro/specs/<feature>/spec.json` の phase / approval / readiness と整合させる。
- Status / validation workflows: `kiro-spec-status`、`kiro-validate-gap`、`kiro-validate-design`、`kiro-validate-impl` は read-only に保ち、検証不能な項目を成功扱いにしない。
- Spec generation workflows: `kiro-spec-init`、`kiro-spec-requirements`、`kiro-spec-design`、`kiro-spec-tasks`、`kiro-spec-quick` を phase gate と review gate 付きで実行する。
- Design quality gate: `kiro-spec-design` では design draft、Boundary Commitments、File Structure Plan、Requirements Traceability、AI gate evidence、`validate-design` の GO / NO-GO を扱う。
- AI quality gate: hallucinated API、存在しない import / path、過剰抽象、未使用コード、scope mismatch、証跡不足、曖昧な review outcome を検出・修正・replan へ分岐する。
- Implementation quality gate: `kiro-impl` は one-task iteration、selected task diff、AI antipattern gate、coding / architecture / QA / testing の並行 review、completion verification、final `validate-impl` を通してから完了扱いにする。
- Current state: major Kiro workflow specs は `tasks-generated` / `ready_for_implementation: true` まで進んでおり、今話す価値は global CLI ではなく、実現済みの品質制御にある。

## Optional Topics
- `create-takt-sdd` が固定 cc-sdd version を内部起動する導入面の改善。
- `takt-sdd-global-cli` は今後の導線整備として最後に一言だけ触れてよいが、主題にはしない。
- appendix は必要な場合だけ作る。

## Avoid
- `takt-marp` 自体の workflow 説明を主題にしない。
- `cc-sdd` の一般紹介に寄せすぎない。
- global CLI / installer の詳細に深入りしない。
- OpenSpec / `opsx:*` の説明に広げない。
- Web画像の自動取得
- 他deck画像の自動流用
- 長い本文をスライドに詰め込むこと

## Narrative Structure
1. Title / 今日の主張
2. cc-sdd v3 / Kiro-style SDD の基本フロー
3. 問題: AIエージェント1回実行では品質保証にならない
4. 解決: TAKT state machine で実行経路を固定する
5. Kiro surface と shared contract: `kiro:*` / parseable output / lifecycle
6. Spec generation / validation の責務分離
7. AI quality gate: scope mismatch・ハルシネーション対策
8. Implementation gate: one-task iteration・AI gate・4観点 parallel review・verify
9. 現在地と次: 実現済みの品質制御と今後の導線整備

## Source Materials
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/README.md
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/README.ja.md
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/package.json
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/CC-SDD-CODEX.md
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.kiro/specs/kiro-workflow-surface/
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.kiro/specs/kiro-shared-workflow-contracts/
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.kiro/specs/kiro-status-validation-workflows/
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.kiro/specs/kiro-spec-generation-workflows/
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.kiro/specs/kiro-ai-quality-gate/
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.kiro/specs/kiro-ai-quality-gate-workflow-coverage/
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.kiro/specs/kiro-iterative-implementation-workflow/
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.kiro/specs/kiro-discovery-batch-workflows/
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.takt/en/workflows/kiro-spec-design.yaml
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.takt/en/workflows/kiro-validate-design.yaml
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.takt/en/workflows/kiro-ai-quality-gate.yaml
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.takt/en/workflows/kiro-impl.yaml
- /Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/.takt/en/workflows/kiro-validate-impl.yaml

## Speaker Notes
各スライドに speaker notes を付ける。本文の読み上げではなく、なぜその gate が必要か、どの spec / workflow に根拠があるか、次の slide へどうつなぐかを書く。1 slide あたり 2-4 文を目安にする。

## Output Requirements
- Format: Marp
- Language: Japanese
- Target slide count: 9
- Deliverables: html, pdf
- Visual scope: use exactly three SVGs. SVG 1 is the cc-sdd v3 / Kiro-style SDD lifecycle (`kiro-discovery` → `kiro-spec-init` → `kiro-spec-requirements` → `kiro-spec-design` → `kiro-validate-design` → `kiro-spec-tasks` → `kiro-impl` → `kiro-validate-impl`). SVG 2 is the overall flow from cc-sdd v3 / Kiro skills to TAKT workflows, `.kiro/specs` artifacts, and validation/review evidence. SVG 3 is the implementation quality gate flow from `plan-one-task` to `execute-task`, AI quality gate, parallel reviewers, completion verification, progress update, and final `validate-impl`.
- For non-visual slides, prefer concise bullets, comparison layouts, and short command/workflow surface excerpts. Do not plan unused SVG placeholders.
