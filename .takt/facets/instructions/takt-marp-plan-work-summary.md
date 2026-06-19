plan command の work 結果を、後続の review/fix/supervision が読める形で要約してください。

**やること:**
1. `brief.md`、`brief.normalized.md`、`reference-analysis.md`、`plan.md`、`slide-blueprint.md` の存在と内容を確認してください。deck-local `slides/<deck>/brief.normalized.md` / `slides/<deck>/reference-analysis.md` / `slides/<deck>/plan.md` / `slides/<deck>/slide-blueprint.md` が存在しない場合は、この step の `Report Directory/brief.normalized.md` / `Report Directory/reference-analysis.md` / `Report Directory/plan.md` / `Report Directory/slide-blueprint.md` を読んでください。
2. `plan.md` に requested deliverables が authoritative delivery request として明記されていることを確認してください。
3. `plan.md` に Coverage Matrix、Visual Strategy、Plan Findings があることを確認してください。
4. `slide-blueprint.md` に Slide Blueprint Table、Section Assembly Manifest、Coverage Trace があることを確認してください。
5. work step で作成・変更された source artifacts と、未解決の非ブロッキング確認事項、coverage 未対応 finding、visual render owner 未設定 finding、slide count 矛盾 finding、blueprint 不足 finding を整理してください。
5. `review/plan-work.md` に work summary を書いてください。

**判定基準:**
- deck-local または `Report Directory` の `plan.md` と `slide-blueprint.md` が存在し、slide plan、blueprint、requested deliverables が確認できる場合は `passed` としてください。
- deck-local に artifact がまだ同期されていないことだけを `needs_input` 理由にしないでください。TAKT run 内では `Report Directory` の source artifact を正本として扱います。
- deck-local と `Report Directory` の両方で `plan.md`、`slide-blueprint.md`、または requested deliverables が欠ける場合は `needs_input` としてください。
- Coverage Matrix、Visual Strategy、Plan Findings、Slide Blueprint Table、Section Assembly Manifest が欠ける場合は、可能なら plan source artifact を修正すべき work issue として記録してください。`plan.md` 自体が読めるなら artifact 未同期や coverage finding の存在だけで `needs_input` にしないでください。

**report file format:**
- `review/plan-work.md` は YAML front matter で開始し、`command: plan`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: work`、`cycle`、`state: worked`、`result`、`source_artifact_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Plan Work Summary
- Result: passed / needs_input
- Source artifacts:
- Requested deliverables:
- Slide blueprint:
- Coverage matrix:
- Visual strategy:
- Plan findings:
- Human review points:
- Blocking issues:
