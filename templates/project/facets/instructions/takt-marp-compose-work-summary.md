compose command の work 結果を、後続の review/fix/supervision が読める形で要約してください。

**やること:**
1. `.takt/workflow-current-target.json`、marker の `design_contract.path` が指す Resolved Design Contract、`sections/manifest.md`、`sections/*.md`、`SLIDES.md`、HTML visual、`images/*` の存在と変更状況を確認してください。
2. compose source artifacts が `plan.md`、`slide-blueprint.md` に記録された `contract_sha256` と Resolved Design Contract の `fingerprint.contract_sha256` に整合しているか確認してください。
3. render output を成功条件に含めず、source artifact の作成・変更だけを整理してください。
4. `review/compose-work.md` に work summary を書いてください。

**判定基準:**
- Resolved Design Contract metadata、`sections/manifest.md`、必要な `sections/*.md`、`SLIDES.md`、必要なHTML visualと `images/*` が確認できる場合は `passed` としてください。
- compose source artifact が不足する場合は `needs_input` としてください。

**report file format:**
- `review/compose-work.md` は YAML front matter で開始し、`command: compose`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: work`、`cycle`、`state: worked`、`result`、`source_artifact_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Compose Work Summary
- Result: passed / needs_input
- Source artifacts:
- Design contract:
- Section artifacts:
- HTML visuals:
- Visual assets:
- Created or changed artifacts:
- Human review points:
- Blocking issues:
