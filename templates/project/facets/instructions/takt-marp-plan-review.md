plan command の成果物をレビューしてください。

**やること:**
1. `brief.md`、`brief.normalized.md`、`reference-analysis.md`、`plan.md`、`slide-blueprint.md`、`review/plan-work.md`、`.takt/workflow-current-target.json` を読んでください。marker に `design_contract.path` がある場合は Resolved Design Contract も読んでください。deck-local `brief.normalized.md` / `reference-analysis.md` / `plan.md` / `slide-blueprint.md` / `review/plan-work.md` が存在しない場合は、この step の `Report Directory/brief.normalized.md` / `Report Directory/reference-analysis.md` / `Report Directory/plan.md` / `Report Directory/slide-blueprint.md` / `Report Directory/plan-work.md` を読んでください。
2. 発表目的、聴衆、中心メッセージ、slide count、各スライドの Message/Layout/Content/Visual/Visual Strategy/Source が矛盾していないか確認してください。
3. `plan.md` の requested deliverables が `brief.md` / `brief.normalized.md` の Output Requirements と矛盾していないか確認してください。
4. `slide-blueprint.md` の slide count、slide ID、section assembly manifest、Visual Strategy、Coverage Trace が `plan.md` と矛盾していないか確認してください。
5. `brief.md` / `brief.normalized.md` の重要情報が `plan.md` と `slide-blueprint.md` に残っているか completeness gate として検査してください。単なる矛盾チェックで終わらせないでください。
6. `plan.md` の `Coverage Matrix` を検査し、固定アウトラインの章・節・leaf項目、章別要素、コード例、演習、巻末資料、品質チェック項目、Visual Rendering Coverage が slide ID または plan finding に対応していることを確認してください。
7. `Target slide count` と固定アウトライン・情報密度・講義本体要件の矛盾を検査してください。`Target slide count: 5` なのに期待値 `slides.md` 相当の講義本体を求めている場合は、target を100〜140または期待値相当(例:119)へ修正する必要がある、という blocker または major finding にしてください。勝手に119枚へ拡張した plan も、勝手に5枚へ圧縮した plan も finding 対象です。
8. `plan.md` と `slide-blueprint.md` の Design Contract section を検査し、marker の `design_contract.fingerprint.contract_sha256` と `contract_sha256` が一致すること、Design Brief fingerprint が current Resolved Design Contract と一致すること、token summary、brand fonts、adherence availability、`guidance`、`source_catalog` が欠けていないことを確認してください。Design Contract section 欠落、`contract_sha256` 欠落・不一致、Design Brief fingerprint 欠落・不一致、`guidance` / `source_catalog` 欠落は `needs_fix` finding としてください。
9. 修正が必要な finding だけを stable `finding_id` 付きで記録してください。
10. `review/plan-review.md` を書いてください。

**completeness gate の必須検査:**
- `brief.normalized.md` の `Critical Constraints` / `Output Requirements` / `Fact Inventory` / `Event Context` から正式タイトル、講師名、講師所属、主催、日時、形式、対象、出力要件を抽出し、`plan.md` / `slide-blueprint.md` / title slide plan に完全一致で残っていることを確認してください。欠落・表記揺れ・誤置換は blocker または major です。
- `brief.normalized.md` の固定アウトラインの章・節・leaf項目が順序と表記を保って coverage matrix に入っていること。欠落・順序変更・章名の言い換えは blocker または major です。
- `brief.normalized.md` の `Avoid` にある禁止語・避けるべき表現が `plan.md` に保持され、`plan.md` / `slide-blueprint.md` の本文候補で使用されていないことを確認してください。禁止語の使用は blocker、禁止語リスト自体の欠落は major 以上です。
- `brief.normalized.md` の `Design Requirements` と `Terminology Policy` が plan に残っていること。色、印刷、情報密度、文字サイズ、図表方針、用語統一、過剰装飾の禁止など、各節に保持された明示制約を落とした場合は major 以上です。
- `brief.normalized.md` の `Example Policy` にある共通題材・具体例方針が全章・コード例・演習で一貫していること。章ごとに題材を変えたり、brief で指定された語彙を別題材へ置換した場合は major 以上です。
- `brief.normalized.md` のコード例方針と演習方針が coverage 対象になっていること。言語、Before/After、業務意味、フレームワーク依存可否、個人/グループ、模範回答、巻末資料などの明示制約を落とした場合は major 以上です。
- Visual Strategy が各スライドに存在し、`render_owner: compose_sections` / `render_owner: generate_visuals` のどちらかを明示していること。
- `plan.md` と `slide-blueprint.md` の Design Contract section に `contract_sha256`、Design Brief fingerprint、token summary、brand fonts、adherence availability、`guidance`、`source_catalog` があり、marker / Resolved Design Contract と一致していること。欠落・不一致は major 以上です。
- カード、2列比較、Before/After、表、短い手順、軽量タイムラインが `html:` ではなく `svg:` にされている場合は major finding として扱うこと。SVGを使うなら座標制御・複雑な矢印・再利用・単体レビューの理由が必要です。
- `slide-blueprint.md` の `Slide Blueprint Table` に全slide IDが存在し、`Section Assembly Manifest` が section file名、slide ID範囲、想定slide countを持つこと。欠落は major 以上です。

**判定基準:**
- 修正不要なら `approved` としてください。
- plan source artifact の修正で解消できる問題がある場合は `needs_fix` としてください。
- 入力不足で判断不能な場合だけ `blocked` としてください。
- deck-local に artifact がまだ同期されていないことだけを `blocked` 理由にしないでください。TAKT run 内では `Report Directory` の source artifact を正本として扱います。
- Coverage Matrix、Design Contract metadata、brief 重要情報の欠落は入力不足ではありません。`needs_fix` の finding として扱ってください。

**report file format:**
- `review/plan-review.md` は YAML front matter で開始し、`command: plan`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: review`、`cycle`、`state: reviewed`、`result`、`finding_count`、`blocking_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Plan Review
- Result: approved / needs_fix / blocked
- Findings:
- Design Contract findings:
- Blocking issues:
