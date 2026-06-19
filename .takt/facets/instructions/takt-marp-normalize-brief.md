briefを後続workflowが読みやすい形に正規化してください。

**やること:**
1. `brief.md`を読み、発表目的、聴衆、中心メッセージ、出力要件を整理してください。
2. ローカルSource Materialsが指定されている場合は存在確認し、必要な要点を抜き出してください。
3. URLは自動取得せず、brief内に内容がない場合は非ブロッキングメモとして残してください。
4. **発表コンテキストの確認(必須):** `brief.md` の `## Event` 見出しからイベント名と発表時間(Duration)を確認してください。`Duration` は本編の発表時間を**分単位の数値**(例: `30`)へ正規化して記載し、時間帯表記(例: 14:00〜14:30)や質疑込み表記は数値へ換算したうえで元の記述を Non-blocking notes に残してください。数値へ換算できない場合は「未指定」としてください。`Date` と `Venue` も `## Event` に記載があれば `Event Context` 節へ転記してください。イベント名・発表時間・`Date`・`Venue` のうち欠落している項目は、正規化結果の `Event Context` 節の該当項目に「未指定」と明記し、イベント名・発表時間の欠落は Non-blocking notes にも残してください。
5. **重要制約の保持(必須):** `brief.md` に正式タイトル、講師名、講師所属、固定アウトライン、禁止語、避けるべき表現、用語方針、具体例方針、コード例方針、演習方針、デザイン方針、情報密度、巻末資料、品質チェックがある場合、要約で落とさず `brief.normalized.md` に独立節として保持してください。
6. **契約節の明示(必須):** output contract の節名を使い、`Critical Constraints` には Official Title / Speaker Name / Speaker Affiliation / Fixed Outline を、`Output Requirements` には Target slide count / Deck Mode / Deliverables を必ず書いてください。値が無い項目は「未指定」とし、別名節だけに散らしてはいけません。
7. **固定アウトラインの保持(必須):** 固定アウトラインは章・節・leaf項目の順序と表記を変えずに `Fixed Outline` に保持してください。さらに、すべての leaf 項目を `Required Topics` にも漏れなく列挙してください。
8. **禁止語の保持(必須):** 「使わない」「避ける」「戻さない」等の禁止・回避指示は `Avoid` に転記してください。禁止語だけでなく、避けるべき章名・言い換え・誤記も保持してください。
9. **Fact Inventory の収集(必須):** 登壇者プロフィール(`Speaker Profile`)と事実インベントリ(`Fact Inventory`: version・数値実績・出典等の根拠)を `brief.md` および Source Materials から収集してください。セミナー日時、主催、形式、対象、講師所属が brief にある場合は必ず `Fact Inventory` に残してください。情報が提供されていない場合は「未指定」とするだけで `needs_input` にはしないでください。
10. **slide count 契約の保持(必須):** `Target slide count` は原文値を保持してください。固定アウトライン、資料密度、6時間講義、講義テキスト兼用などの要求と矛盾する場合でも勝手に補正せず、`Deck Mode` と Non-blocking notes に「概要版か講義本体かの修正が必要」と明記してください。`Target slide count: 5` は5枚の概要版として扱い、講義本体を作るには100〜140または期待値相当(例:119)へ修正が必要です。
11. `brief.normalized.md`を書いてください。

**artifact 出力:**
- この step には `Report Directory` / `Report File` が渡されます。`Report File` の `brief.normalized.md` を正本として必ず出力してください。
- deck-local `slides/<deck>/brief.normalized.md` も書ける場合は同じ内容で書いてください。ただし後続 step は `Report Directory/brief.normalized.md` を読める必要があります。

**判定基準:**
- 発表日、appendix要否、PPTX要否など、スライド作成を継続できる未指定事項は非ブロッキングとして扱ってください。
- `brief.md`が存在しない、発表目的・聴衆・中心メッセージ・出力要件のいずれも判断できない、必須Source Materialを読めない場合だけ `needs_input` にしてください。
- `brief.md` が長い、固定アウトラインが多い、Target slide count が矛盾している、という理由だけで `needs_input` にしないでください。矛盾は正規化結果に残し、後続の plan / plan_review で finding として扱えるようにしてください。

**必須出力**
## Normalize Result
- Status: normalized / needs_input
- Files changed:
- Non-blocking notes:
- Blocking issues:
