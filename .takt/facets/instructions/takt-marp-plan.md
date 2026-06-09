正規化されたbriefからスライド設計図を作成してください。

**やること:**
1. `brief.normalized.md`と必要なSource Materialsを読んでください。deck-local `slides/<deck>/brief.normalized.md` が存在しない場合は、この step の `Report Directory/brief.normalized.md` を読んでください。
2. `docs/marp-slide-workflow.md`のplan契約に従って`plan.md`を作成してください。
3. 各スライドに `Message`、`Layout`、`Content`、`Visual`、`Speaker note intent`、`Source` を必ず書いてください。
4. `Layout` は `single`、`visual`、`visual-full`、`split-50-50`、`split-40-60`、`split-60-40`、`compare-2col` のいずれかを選び、1列/2列の理由と比率を短く書いてください。
5. visualは `none`、`svg: ...`、`existing: ...` のいずれかで明示してください。
6. `plan.md` に `Requested Deliverables` セクションを作り、`deliverables: [html, pdf]` のような単一行を必ず含めてください。値は `html`、`pdf`、`pptx` のうち後続 delivery command が生成・確認すべき成果物だけを指定してください。
7. appendixが必要な場合は本編と分けて計画してください。

**artifact 出力:**
- この step には `Report Directory` / `Report File` が渡されます。`Report File` の `plan.md` を正本として必ず出力してください。
- deck-local `slides/<deck>/plan.md` も書ける場合は同じ内容で書いてください。ただし後続 step は `Report Directory/plan.md` を読める必要があります。

**判定基準:**
- 発表日、deck titleの表現、appendix要否、Deliverablesの追加要否など、人間が後で承認できる事項はplan作成を止めないでください。
- slide count、中心メッセージ、必須Source Materialの根拠が決められず `plan.md` を作れない場合だけ `needs_input` にしてください。

**必須出力**
## Plan Result
- Status: planned / needs_input
- Slide count:
- Files changed:
- Non-blocking human review points:
- Blocking issues:
