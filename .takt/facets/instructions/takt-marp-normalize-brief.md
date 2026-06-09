briefを後続workflowが読みやすい形に正規化してください。

**やること:**
1. `brief.md`を読み、発表目的、聴衆、中心メッセージ、出力要件を整理してください。
2. ローカルSource Materialsが指定されている場合は存在確認し、必要な要点を抜き出してください。
3. URLは自動取得せず、brief内に内容がない場合は非ブロッキングメモとして残してください。
4. `brief.normalized.md`を書いてください。

**判定基準:**
- 発表日、appendix要否、PPTX要否など、スライド作成を継続できる未指定事項は非ブロッキングとして扱ってください。
- `brief.md`が存在しない、発表目的・聴衆・中心メッセージ・出力要件のいずれも判断できない、必須Source Materialを読めない場合だけ `needs_input` にしてください。

**必須出力**
## Normalize Result
- Status: normalized / needs_input
- Files changed:
- Non-blocking notes:
- Blocking issues:
