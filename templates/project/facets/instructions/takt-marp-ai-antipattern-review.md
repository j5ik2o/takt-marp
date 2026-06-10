command work output を通常 review / inspect / verify に渡す前に、AI 固有の antipattern だけをレビューしてください。

**やること:**
1. `.takt/workflow-current-target.json` を読み、`target: slides/<deck>` と `command: plan | compose | polish | deliver` を特定してください。
2. 対象 deck の `review/<command>-work.md` を読み、front matter と本文から同じ `target`、`command`、`workflow_run_id`、work 成果物の範囲を確認してください。deck-local report が存在しない場合は、現在の `Report Directory` から親 command の reports directory を特定し、そこにある `<command>-work.md` を読んでください。`Report Directory` が `.../reports/subworkflows/...` の場合、`subworkflows` より前の `.../reports` が親 command の reports directory です。
3. command に応じて reviewed scope を特定してください。`plan` と `compose` は `command-work-report` と source artifacts、`polish` は `render-evidence`、`deliver` は `delivery-artifacts` を主範囲にしてください。`plan` の source artifacts は deck-local が未同期なら親 command reports directory の `brief.normalized.md` と `plan.md` を正本として照合してください。
4. 以下だけを AI-specific finding として分類してください。
   - hallucinated path/tool/API: 存在しない path、利用できない tool、実在確認できない API を前提にした出力
   - unsupported claim: 入力 source artifact、work report、render/delivery evidence にない主張
   - unrequested compatibility: 指示されていない後方互換、代替形式、余分な fallback behavior
   - overbroad abstraction: command 境界を超える抽象化、汎用化、再設計
   - unused generated artifact: workflow の要求や deliverables に紐づかない生成物
5. finding がある場合は `review/<command>-ai-antipattern-review.md` に stable `finding_id`、`family_tag`、location、required change、具体的 evidence を記録してください。
6. ordinary slide content、layout、render、delivery quality finding は、AI-specific fabrication または unsupported assumption に由来する場合だけ AI finding として扱ってください。通常品質だけの観察は `Non-AI Quality Notes` に分離してください。

**判定基準:**
- target、command、reviewed scope が特定でき、AI-specific finding がなければ `approved` としてください。
- current command 境界内で修正可能な AI-specific finding がある場合は `needs_fix` としてください。
- `.takt/workflow-current-target.json`、`review/<command>-work.md`、target、command、workflow_run_id、reviewed scope のいずれかを特定または照合できない場合は `blocked` とし、通常 review / inspect / verify に進めない outcome にしてください。
- plan command では、deck-local `brief.normalized.md` / `plan.md` がまだ存在しないことだけを `blocked` 理由にしないでください。親 command reports directory の `brief.normalized.md` / `plan.md` が読め、work report と照合できる場合は reviewed scope を確認済みとして扱ってください。
- 通常の content、layout、render、delivery artifact 品質だけを理由に `needs_fix` にしないでください。
- external web access を標準の成功条件にしないでください。明示 source material と repository evidence だけを根拠にしてください。

**report file format:**
- `review/<command>-ai-antipattern-review.md` は `.takt/facets/output-contracts/takt-marp-ai-antipattern-review.md` に従ってください。
- YAML front matter は flat scalar のみとし、`command`、`target`、`generated_at`、`workflow_run_id`、`step: ai_antipattern_review`、`cycle`、`reviewed_scope`、`result`、`finding_count`、`blocking_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## AI Antipattern Review
- Result: approved / needs_fix / blocked
- Reviewed target:
- Reviewed command:
- Reviewed scope:
- AI findings:
- Non-AI quality notes:
- Blocking issues:
