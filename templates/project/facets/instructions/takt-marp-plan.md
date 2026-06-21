正規化されたbriefからスライド設計図を作成してください。

**やること:**
1. `brief.normalized.md`、`reference-analysis.md`、`.takt/workflow-current-target.json`、必要なSource Materialsを読んでください。deck-local `slides/<deck>/brief.normalized.md` / `slides/<deck>/reference-analysis.md` が存在しない場合は、この step の `Report Directory/brief.normalized.md` / `Report Directory/reference-analysis.md` を読んでください。primary input は引き続き `brief.md` / `brief.normalized.md` です。
2. bindされている `takt-marp-slide-plan` と `takt-marp-slide-blueprint` の output contract に従って、`plan.md` と `slide-blueprint.md` を作成してください。古いdocsのplan記述とこのinstructionやoutput contractが矛盾する場合は、このinstructionとoutput contractを優先してください。
3. compose用の詳細設計として `slide-blueprint.md` を作成してください。`plan.md` は講義全体の設計とcoverage、`slide-blueprint.md` は各slideのcontent atoms、visual strategy、section assembly manifestを担います。
4. 各スライドに `Message`、`Layout`、`Content`、`Visual`、`Visual Strategy`、`Speaker note intent`、`Source` を必ず書いてください。
5. `Layout` は knowledge `takt-marp-repo-conventions` の「Layout 語彙」表にある基本語彙のいずれかを選んでください。基本語彙で表現できない場合のみ `custom: <kebab-case-class> — <用途1行>` 句を使用してください。modifier を使う場合は `Layout` に基本 class と併記してください(例: `single profile`)。modifier 単独の指定は不可です。1列/2列の理由と比率を短く書いてください。
6. visualは `none`、`html: ...`、`svg: ...`、`inline-svg: ...`、`existing: ...` のいずれかで明示してください。
   - `html:` はカード、比較、表、Before/After、軽量フロー、タイムライン、チェックリスト、コード注釈など section source 内HTML/CSSで構成できる場合に使い、`Visual Strategy` に `render_owner: compose_sections` を書いてください。
   - `svg:` と `inline-svg:` は座標制御、複雑な矢印、再利用図版、単体レビューが必要な場合に限定し、`Visual Strategy` に `render_owner: generate_visuals` とSVGを選ぶ理由を書いてください。
   - `existing:` は明示された既存画像・図版だけに使い、`Visual Strategy` に `render_owner: generate_visuals` を書いてください。
   - HTML/CSSで十分なカード、2列比較、表、短い手順を `svg:` にしないでください。
7. `plan.md` に `Requested Deliverables` セクションを作り、`deliverables: [html, pdf]` のような単一行を必ず含めてください。値は `html`、`pdf`、`pptx` のうち後続 delivery command が生成・確認すべき成果物だけを指定してください。
8. appendixが必要な場合は本編と分けて計画してください。
9. `plan.md` に `Coverage Matrix` セクションを必ず作ってください。固定アウトラインの各章・節・leaf項目、章別要素、コード例、演習、巻末資料、品質チェック項目、visual種別と担当stepがどの slide ID に対応するかを明示してください。
10. `slide-blueprint.md` に `Slide Blueprint Table` と `Section Assembly Manifest` を必ず作ってください。各slideのcontent atomsを具体化し、後続composeが本文を一括推測しなくて済む粒度にしてください。
11. 固定アウトラインの leaf 項目は `brief.normalized.md` の `Fixed Outline` / `Required Topics` から拾い、順序と表記を変えずに coverage 対象にしてください。
12. 未対応項目がある場合は `needs_input` にせず、`Plan Findings` に stable finding ID、severity、evidence、修正案を書いてください。Coverage Matrix 側にも `not covered -> finding_id` を残してください。
13. deck-local `slides/<deck>/research/research-report.md`、`slides/<deck>/research/research-claims.md`、`slides/<deck>/research/open-questions.md` が存在する場合だけ optional research context として読んでください。存在しない場合は従来どおり brief と reference-analysis から plan を作成し、failure や `needs_input` にしないでください。
14. research context を使った場合は、`Research Context Usage` に artifact 名、claim_id/source_id などの識別子、plan へ反映した根拠、反映しなかった理由を残してください。各 slide の `Source` でも research 由来の根拠を識別してください。
15. `open-questions.md` は未解決前提または保留として扱い、推測で回答を埋めず、必要なら `Plan Findings` または `Non-blocking human review points` に残してください。
16. plan command の成功条件として外部 web access や追加調査を要求しないでください。
17. `Target slide count` と固定アウトライン・情報密度・講義本体要件が矛盾する場合は、勝手に圧縮しないでください。`Target slide count: 5` は5枚の概要版として計画し、講義本体を生成するには target を100〜140または期待値相当(例:119)へ修正する必要があることを `Plan Findings` に記録してください。
18. marker の `design_contract` を読み、marker の `design_contract.path` が指す Resolved Design Contract JSON を必ず開いてください。Resolved Design Contract の source path、namespace、fingerprint、token summary、adherence availability、token constraints を `plan.md` と `slide-blueprint.md` に記録してください。`design_contract` がない、path が読めない、または brief の要求と token constraints が両立しない場合は、推測で補完せず finding または `needs_input` にしてください。
19. plan artifact には CSS、front matter style、`_class` style 定義を書かないでください。layout / visual / density の制約だけを、後続 compose が実装できる指示として書いてください。

**artifact 出力:**
- この step には `Report Directory` / `Report File` が渡されます。`Report File` の `plan.md` を正本として必ず出力してください。
- `slide-blueprint.md` も同じ `Report Directory` に出力してください。
- deck-local `slides/<deck>/plan.md` と `slides/<deck>/slide-blueprint.md` も書ける場合は同じ内容で書いてください。ただし後続 step は `Report Directory/plan.md` / `Report Directory/slide-blueprint.md` を読める必要があります。

**判定基準:**
- 発表日、deck titleの表現、appendix要否、Deliverablesの追加要否など、人間が後で承認できる事項はplan作成を止めないでください。
- slide count、中心メッセージ、必須Source Materialの根拠が決められず `plan.md` を作れない場合だけ `needs_input` にしてください。
- research artifacts がないことや、`open-questions.md` に未解決項目があることだけを `needs_input` にしないでください。
- 固定アウトラインや要求密度に対して slide count が不足する場合は、`plan.md` を作ったうえで finding として修正対象にしてください。入力不足ではなく、brief/plan の矛盾として扱います。

**必須出力**
## Plan Result
- Status: planned / needs_input
- Slide count:
- Slide blueprint:
- Coverage matrix:
- Visual rendering coverage:
- Design contract:
- Research context usage:
- Plan findings:
- Files changed:
- Non-blocking human review points:
- Blocking issues:
