brief.normalized.md と参照デッキ候補から、期待値分析を作成してください。

**やること:**
1. `brief.normalized.md` を読んでください。deck-local `slides/<deck>/brief.normalized.md` が存在しない場合は、この step の `Report Directory/brief.normalized.md` を読んでください。
2. deck directory に `_slides.md`、`slides.md`、`SLIDES.md`、または brief の Source Materials で明示された参照デッキがあるか確認してください。
3. 参照デッキが存在する場合は、本文をコピーせず、slide count、章/節の範囲、appendix比率、情報密度、speaker notes量、visual/layout pattern、coverage期待値だけを分析してください。
4. 参照デッキが存在しない場合も `reference-analysis.md` を出力し、Found: no、分析できない理由、planへ伝搬すべき代替根拠を明示してください。
5. `Target slide count` と参照デッキのslide countが矛盾する場合は、勝手に補正せず Plan Implications に finding 候補として記録してください。
6. HTML/CSSで再構成できるvisual patternと、SVG/既存画像が必要なvisual patternを分けて記録してください。

**artifact 出力:**
- この step には `Report Directory` / `Report File` が渡されます。`Report File` の `reference-analysis.md` を正本として必ず出力してください。
- deck-local `slides/<deck>/reference-analysis.md` も書ける場合は同じ内容で書いてください。ただし後続 step は `Report Directory/reference-analysis.md` を読める必要があります。

**禁止事項**
- 参照デッキの本文を `plan.md`、`slide-blueprint.md`、`SLIDES.md` にコピーしてよい根拠として扱わないでください。
- 参照デッキにあるからという理由だけで、brief にない事実・実績・URL・肩書を追加しないでください。
- 参照デッキが見つからないことだけを `needs_input` にしないでください。

**判定基準:**
- `reference-analysis.md` を作成できた場合は `analyzed` としてください。参照デッキがなくても Found: no として分析結果を出していれば `analyzed` です。
- `brief.normalized.md` が読めず、参照デッキ候補の探索対象も判断できない場合だけ `needs_input` にしてください。

**必須出力**
## Reference Analysis Result
- Status: analyzed / needs_input
- Reference source:
- Reference slide count:
- Density profile:
- Plan implications:
- Files changed:
- Blocking issues:
