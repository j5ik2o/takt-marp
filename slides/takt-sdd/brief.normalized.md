# Normalized Brief

このファイルは TAKT が後段 workflow（plan / write / visual）のために `brief.md` を整理した作業用入力である。人間入力の正は `slides/takt-sdd/brief.md`。意図を変える場合は `brief.md` を更新して plan を再生成すること。

## 一言サマリ
takt-sdd は cc-sdd v3 の Kiro-style SDD を、TAKT の決定論的 workflow と品質ゲートで、spec 生成から実装完了判定まで運用可能にする。聴衆が持ち帰る一文はこれ。

## Event
- イベント名: takt-sdd with cc-sdd v3
- 日付: 2026-06-10
- 尺: 12:30–12:58（28分）
- 会場: Online
- 聴衆: cc-sdd / Kiro-style SDD の概念には馴染みがあるが、takt-sdd の workflow 内部は未知の開発者・メンテナ

## Goal
聴衆に、takt-sdd が cc-sdd v3 の手順を「実行するだけ」ではなく、spec 生成から実装完了判定までを TAKT の状態遷移・read-only validation・AI quality gate・並行 review で運用可能な品質管理プロセスにしていることを理解してもらう。

## Core Message
takt-sdd は cc-sdd v3 の Kiro-style SDD を、TAKT の決定論的 workflow と品質ゲートで、spec 生成から実装完了判定まで運用可能にする。

## Audience Context
- 聴衆は SDD の一般論ではなく、「takt-sdd が cc-sdd v3 対応で何を TAKT workflow 化し、どの品質リスクをどこで止めるか」を知りたい。
- 主題は `takt-sdd` の cc-sdd v3 対応・Kiro-compatible workflow・品質ゲート・実装完了判定。
- `takt-marp` はこの deck を生成する手段にすぎず、発表の主題ではない（混同しない）。

## Required Topics
1. なぜ takt-sdd か: cc-sdd v3 を呼ぶだけでは、実行順序・レビュー境界・完了判定・証跡確認が会話任せになりやすい。
2. 決定論的 workflow 化: `kiro:*` surface、YAML state machine、phase gate、parseable output contract で、自由会話ではなく状態遷移として進める。
3. Kiro shared contract: status / validation / review / debug / completion を machine-readable にし、`.kiro/specs/<feature>/spec.json` の phase / approval / readiness と整合させる。
4. Status / validation workflows: `kiro-spec-status` `kiro-validate-gap` `kiro-validate-design` `kiro-validate-impl` は read-only に保ち、検証不能な項目を成功扱いにしない。
5. Spec generation workflows: `kiro-spec-init` `kiro-spec-requirements` `kiro-spec-design` `kiro-spec-tasks` `kiro-spec-quick` を phase gate + review gate 付きで実行。
6. Design quality gate: `kiro-spec-design` は design draft、Boundary Commitments、File Structure Plan、Requirements Traceability、AI gate evidence、`validate-design` の GO / NO-GO を扱う。
7. AI quality gate: hallucinated API、存在しない import / path、過剰抽象、未使用コード、scope mismatch、証跡不足、曖昧な review outcome を検出 → 修正 → replan へ分岐。
8. Implementation quality gate: `kiro-impl` は one-task iteration、selected task diff、AI antipattern gate、coding / architecture / QA / testing の並行 review、completion verification、final `validate-impl` を通してから完了扱いにする。
9. Current state: major Kiro workflow specs は `tasks-generated` / `ready_for_implementation: true` まで進んでおり、語る価値は global CLI ではなく実現済みの品質制御にある。

## Optional Topics
- `create-takt-sdd` が固定 cc-sdd version を内部起動する導入面の改善。
- `takt-sdd-global-cli` は今後の導線整備として最後に一言だけ。主題にはしない。
- appendix は必要な場合だけ作成。

## Avoid
- `takt-marp` 自体の workflow 説明を主題にしない。
- `cc-sdd` の一般紹介に寄せすぎない。
- global CLI / installer の詳細に深入りしない。
- OpenSpec / `opsx:*` に広げない。
- Web画像の自動取得、他 deck 画像の自動流用。
- 長い本文をスライドに詰め込む。

## Narrative Structure（9スライド）
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
以下17件はすべてディスク上に存在することを確認済み（`test -e` で OK）。いずれも作業ディレクトリ（`takt-marp`）外の別リポジトリ `takt-sdd` 配下にある。本 step では本文を読み取れていない（理由と扱いは Non-blocking Notes 参照）。後段 step で各ファイルを直接参照し、事実主張を根拠付けること。

- `takt-sdd/README.md`
- `takt-sdd/README.ja.md`
- `takt-sdd/package.json`
- `takt-sdd/CC-SDD-CODEX.md`
- `takt-sdd/.kiro/specs/kiro-workflow-surface/`
- `takt-sdd/.kiro/specs/kiro-shared-workflow-contracts/`
- `takt-sdd/.kiro/specs/kiro-status-validation-workflows/`
- `takt-sdd/.kiro/specs/kiro-spec-generation-workflows/`
- `takt-sdd/.kiro/specs/kiro-ai-quality-gate/`
- `takt-sdd/.kiro/specs/kiro-ai-quality-gate-workflow-coverage/`
- `takt-sdd/.kiro/specs/kiro-iterative-implementation-workflow/`
- `takt-sdd/.kiro/specs/kiro-discovery-batch-workflows/`
- `takt-sdd/.takt/en/workflows/kiro-spec-design.yaml`
- `takt-sdd/.takt/en/workflows/kiro-validate-design.yaml`
- `takt-sdd/.takt/en/workflows/kiro-ai-quality-gate.yaml`
- `takt-sdd/.takt/en/workflows/kiro-impl.yaml`
- `takt-sdd/.takt/en/workflows/kiro-validate-impl.yaml`

（ベースパス: `/Users/j5ik2o/Sources/j5ik2o.github.com/j5ik2o/takt-sdd/`）

## Speaker Notes
各スライドに speaker notes を付ける。本文の読み上げではなく、なぜその gate が必要か / どの spec・workflow に根拠があるか / 次スライドへどうつなぐかを、1スライドあたり 2–4 文で書く。

## Output Requirements
- Format: Marp
- Language: 日本語
- 目標スライド数: 9
- Deliverables: html, pdf（PPTX は不要）
- Visual scope: SVG はちょうど3点。
  - SVG 1: cc-sdd v3 / Kiro-style SDD の基本フロー（`kiro-discovery` → `kiro-spec-init` → `kiro-spec-requirements` → `kiro-spec-design` → `kiro-validate-design` → `kiro-spec-tasks` → `kiro-impl` → `kiro-validate-impl`）。
  - SVG 2: cc-sdd v3 / Kiro skills → TAKT workflows → `.kiro/specs` artifacts → validation / review evidence までの全体フロー。
  - SVG 3: 実装品質ゲートのフロー（`plan-one-task` → `execute-task` → AI quality gate → parallel reviewers → completion verification → progress update → final `validate-impl`）。
- 非ビジュアルスライド: 簡潔な bullet、比較レイアウト、短い command / workflow surface 抜粋を優先。未使用 SVG プレースホルダは作らない。

## Non-blocking Notes
- Source Materials 17件は存在確認済み（`test -e` で OK）だが、いずれも作業ディレクトリ `takt-marp` 外の別リポジトリ `takt-sdd` 配下にあり、本 worker のサンドボックス制約で本文の読み取り（cat / Read）はブロックされた。存在確認のみ実施。これは成功扱いの根拠にはしない。後段の writer / visual step で各ファイルを直接読み、事実主張を根拠付けること。本 step では `brief.md`（人間入力の正）を一次情報として正規化した。
- brief に URL 形式の素材はなく、Web 取得は不要。
- PPTX は Deliverables に含まれないため生成対象外。
- appendix は任意。28分 / 8スライドなので 1スライドあたり約3.5分。情報密度を上げすぎない。
- Current state の `tasks-generated` / `ready_for_implementation: true` 等の具体値は `brief.md` 記述ベースの主張。最終スライドで使う際は対象 spec の `spec.json` で再確認することが望ましい。

## Blocking Issues
- なし。発表目的・聴衆・中心メッセージ・出力要件はすべて `brief.md` から確定でき、必須見出しも揃っているため normalized と判定した。
