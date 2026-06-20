brief.normalized.md と参照デッキ候補から、期待値分析を作成してください。

**やること:**
1. `brief.normalized.md` を読んでください。deck-local `slides/<deck>/brief.normalized.md` が存在しない場合は、この step の `Report Directory/brief.normalized.md` を読んでください。
2. deck directory に `_slides.md`、`slides.md`、または brief の Source Materials で明示された参照デッキがあるか確認してください。assembled outputである `SLIDES.md` は参照デッキ候補にしてはいけません。
3. 参照デッキが存在する場合は、本文をコピーせず、slide count、章/節の範囲、appendix比率、情報密度、speaker notes量、visual/layout pattern、coverage期待値だけを分析してください。
4. 参照デッキが存在しない場合も `reference-analysis.md` を出力し、Found: no、分析できない理由、planへ伝搬すべき代替根拠を明示してください。
5. deck-local `slides/<deck>/research/research-report.md`、`slides/<deck>/research/research-claims.md`、`slides/<deck>/research/open-questions.md` が存在する場合だけ optional research context として読んでください。存在しない場合は failure や `needs_input` にしないでください。
6. research context を読んだ場合は、research-derived evidence と未解決前提を `Research Context` に記録し、どの artifact 由来か識別できるようにしてください。
7. `open-questions.md` の内容は未解決前提または保留として扱い、推測で埋めないでください。
8. `Target slide count` と参照デッキのslide countが矛盾する場合は、勝手に補正せず Plan Implications に finding 候補として記録してください。
9. HTML/CSSで再構成できるvisual patternと、SVG/既存画像が必要なvisual patternを分けて記録してください。

**artifact 出力:**
- この step には `Report Directory` / `Report File` が渡されます。`Report File` の `reference-analysis.md` を正本として必ず出力してください。
- deck-local `slides/<deck>/reference-analysis.md` も書ける場合は同じ内容で書いてください。ただし後続 step は `Report Directory/reference-analysis.md` を読める必要があります。

**禁止事項**
- 参照デッキの本文を `plan.md`、`slide-blueprint.md`、`SLIDES.md` にコピーしてよい根拠として扱わないでください。
- 参照デッキにあるからという理由だけで、brief にない事実・実績・URL・肩書を追加しないでください。
- 参照デッキが見つからないことだけを `needs_input` にしないでください。
- research artifacts がないことを `needs_input` にしないでください。
- plan command 内で外部 web access や追加調査を成功条件にしないでください。

**判定基準:**
- `reference-analysis.md` を作成できた場合は `analyzed` としてください。参照デッキがなくても Found: no として分析結果を出していれば `analyzed` です。
- `brief.normalized.md` が読めず、参照デッキ候補の探索対象も判断できない場合だけ `needs_input` にしてください。

**必須出力**
# Reference Deck Analysis

以下のcontract sectionを必ず含めてください。
- Reference Source
- Slide Count and Mode
- Structure Map
- Coverage Expectations
- Visual and Layout Patterns
- Reuse Boundary
- Research Context
- Plan Implications
