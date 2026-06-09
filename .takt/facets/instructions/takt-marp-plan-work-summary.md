plan command の work 結果を、後続の review/fix/supervision が読める形で要約してください。

**やること:**
1. `brief.md`、`brief.normalized.md`、`plan.md` の存在と内容を確認してください。
2. `plan.md` に requested deliverables が authoritative delivery request として明記されていることを確認してください。
3. work step で作成・変更された source artifacts と、未解決の非ブロッキング確認事項を整理してください。
4. `review/plan-work.md` に work summary を書いてください。

**判定基準:**
- `plan.md` が存在し、slide plan と requested deliverables が確認できる場合は `passed` としてください。
- `plan.md` または requested deliverables が欠ける場合は `needs_input` としてください。

**report file format:**
- `review/plan-work.md` は YAML front matter で開始し、`command: plan`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: work`、`cycle`、`state: worked`、`result`、`source_artifact_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Plan Work Summary
- Result: passed / needs_input
- Source artifacts:
- Requested deliverables:
- Human review points:
- Blocking issues:
