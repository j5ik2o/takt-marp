briefを後続workflowが読みやすい形に正規化してください。

**やること:**
1. `brief.md`を読み、発表目的、聴衆、中心メッセージ、出力要件を整理してください。
2. ローカルSource Materialsが指定されている場合は存在確認し、必要な要点を抜き出してください。
3. URLは自動取得せず、brief内に内容がない場合は非ブロッキングメモとして残してください。
4. **発表コンテキストの確認(必須):** `brief.md` の `## Event` 見出しからイベント名と発表時間(Duration)を確認してください。`Duration` は本編の発表時間を**分単位の数値**(例: `30`)へ正規化して記載し、時間帯表記(例: 14:00〜14:30)や質疑込み表記は数値へ換算したうえで元の記述を Non-blocking notes に残してください。数値へ換算できない場合は「未指定」としてください。`Date` と `Venue` も `## Event` に記載があれば `Event Context` 節へ転記してください。イベント名・発表時間・`Date`・`Venue` のうち欠落している項目は、正規化結果の `Event Context` 節の該当項目に「未指定」と明記し、イベント名・発表時間の欠落は Non-blocking notes にも残してください。
5. **発表コンテキストの収集(推奨):** 登壇者プロフィール(`Speaker Profile`)と事実インベントリ(`Fact Inventory`: version・数値実績・出典等の根拠)を `brief.md` および Source Materials から収集してください。情報が提供されていない場合は「未指定」とするだけで `needs_input` にはしないでください。
6. `brief.normalized.md`を書いてください。

**artifact 出力:**
- この step には `Report Directory` / `Report File` が渡されます。`Report File` の `brief.normalized.md` を正本として必ず出力してください。
- deck-local `slides/<deck>/brief.normalized.md` も書ける場合は同じ内容で書いてください。ただし後続 step は `Report Directory/brief.normalized.md` を読める必要があります。

**判定基準:**
- 発表日、appendix要否、PPTX要否など、スライド作成を継続できる未指定事項は非ブロッキングとして扱ってください。
- `brief.md`が存在しない、発表目的・聴衆・中心メッセージ・出力要件のいずれも判断できない、必須Source Materialを読めない場合だけ `needs_input` にしてください。

**必須出力**
## Normalize Result
- Status: normalized / needs_input
- Files changed:
- Non-blocking notes:
- Blocking issues:
