{extends:fix}

AI antipattern review の finding を、current command 境界内で安全に直せる場合だけ修正してください。

**やること:**
1. `.takt/workflow-current-target.json` を読み、`target: slides/<deck>` と `command: plan | compose | polish | deliver` を特定してください。
2. `review/<command>-ai-antipattern-review.md` を読み、同じ `target`、`command`、`workflow_run_id` の current review report であることを確認してください。deck-local report が存在しない場合は、現在の `Report Directory` にある `ai-antipattern-review.md`、または同じ subworkflow reports directory の review report を読んでください。
3. AI Findings の全 finding を扱い、各 finding について current command 境界内で安全に修正できるか判断してください。
4. 修正できる finding だけを command-local source artifact に反映してください。
   - `plan`: `plan.md`、`slide-blueprint.md`、`reference-analysis.md`、`brief.normalized.md` など plan source artifact の範囲。deck-local が未同期の場合は、現在の `Report Directory` から親 command reports directory を特定し、そこにある `plan.md` / `slide-blueprint.md` / `reference-analysis.md` / `brief.normalized.md` を正本として修正してください。`Report Directory` が `.../reports/subworkflows/...` の場合、`subworkflows` より前の `.../reports` が親 command reports directory です。
   - `compose`: `sections/*`、`SLIDES.md` と compose に必要な deck-local source artifact の範囲。Resolved Design Contract 自体は修正せず、必要なら re-plan / Claude Design Source 更新として記録してください。
   - `polish`: `sections/*`、`SLIDES.md`、HTML visual、`images/*` など visual / layout / render / design-token 修正の範囲。Resolved Design Contract 自体は修正しません。
   - `deliver`: delivery artifact の存在、path、readability、unrequested artifact、必要な clean / rebuild の範囲
5. current command 境界内で安全に直せない finding は `NEED_REPLAN` とし、必要な owning command と理由を Remaining Context に記録してください。
6. 必要情報が足りず判断または修正できない finding は `BLOCKED` とし、不足 context と evidence を Remaining Context に記録してください。
7. `review/<command>-ai-antipattern-fix.md` に finding ごとの decision、changed files、validation evidence、remaining context を記録してください。

**境界:**
- approval file を生成、上書き、削除しないでください。`review/*-approval.md` は人間操作の記録です。
- git commit、push、branch 操作、PR 操作、TAKT 再起動、workflow orchestration を行わないでください。
- AI review report にない通常品質 finding を追加修正しないでください。
- `polish` を plan redesign、中心メッセージ変更、deliverables 変更へ広げないでください。
- `deliver` を visual / layout / content / design-token inspection へ広げないでください。該当する問題は `NEED_REPLAN` または `BLOCKED` の context として記録してください。
- external web access を標準の成功条件にしないでください。明示 source material と repository evidence だけを根拠にしてください。

**判定基準:**
- 全 finding を current command 境界内で修正でき、validation evidence を記録できた場合は `FIXED` としてください。
- 修正不要と判断する場合は `NO_FIX_NEEDED` とし、すべての finding に finding-level evidence を記録してください。
- current command 境界外の作業、上流 artifact の再設計、人間判断が必要な場合は `NEED_REPLAN` としてください。
- report、target、command、workflow_run_id、source artifact、必要 context のいずれかを確認できない場合は `BLOCKED` としてください。
- plan command では、deck-local `brief.normalized.md` / `plan.md` がまだ存在しないことだけを `NEED_REPLAN` または `BLOCKED` 理由にしないでください。親 command reports directory の source artifact が読め、finding を current command 境界内で修正できる場合はその report artifact を更新してください。

**report file format:**
- `review/<command>-ai-antipattern-fix.md` は `.takt/facets/output-contracts/takt-marp-ai-antipattern-fix.md` に従ってください。
- YAML front matter は flat scalar のみとし、`command`、`target`、`generated_at`、`workflow_run_id`、`step: ai_antipattern_fix`、`cycle`、`status`、`handled_finding_count`、`changed_file_count`、`remaining_context_count` を含めてください。
- `status` は `FIXED`、`NO_FIX_NEEDED`、`NEED_REPLAN`、`BLOCKED` のいずれかだけを使ってください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## AI Antipattern Fix
- Status: FIXED / NO_FIX_NEEDED / NEED_REPLAN / BLOCKED
- Reviewed target:
- Reviewed command:
- Handled findings:
- Changed files:
- Validation evidence:
- Remaining context:
