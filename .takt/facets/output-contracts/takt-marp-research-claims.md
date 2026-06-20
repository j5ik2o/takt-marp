# Research Claims Artifact

この report は `slides/<deck>/research/research-claims.md` として同期される built-in report 派生 index artifact です。

## 出力形式

- 先頭は YAML front matter の `---` で始めてください。
- front matter は scalar / inline-array subset のみを使い、nested object は使わないでください。
- `source_report: research-report.md` と `source_report_origin: builtin_deep_research` を必ず含めてください。
- built-in report 内で確認できない値は推測せず、literal `not_present_in_builtin_report` または caveat で表現してください。

```markdown
---
command: research
target: slides/<deck>
generated_at: 2026-01-01T00:00:00.000Z
workflow_run_id: takt-run-id
source_report: research-report.md
source_report_origin: builtin_deep_research
---

# Research Claims

## Claims

| claim_id | claim | confidence | source_ids | slide_use | caveats |
|----------|-------|------------|------------|-----------|---------|
| claim-001 | Example claim from the built-in report | not_present_in_builtin_report | [] | Candidate slide claim | source mapping not_present_in_builtin_report |

## Caveats

- confidence または claim/source 対応が built-in report にない場合は `not_present_in_builtin_report`、`source_ids: []`、caveat で欠落を表現する。
```

## Required Fields

- `claim_id`: stable local ID such as `claim-001`
- `claim`: claim text that appears in the built-in report
- `confidence`: `confirmed` / `inferred` / `uncertain` / `not_present_in_builtin_report`
- `source_ids`: inline-array source IDs, or `[]` when mapping is not present
- `slide_use`: how this claim may be used in slides, without adding new claims
- `caveats`: inline-array or table cell text containing caveats, including `not_present_in_builtin_report` when mapping/confidence is missing

## Constraints

- Do not create claims that are absent from the built-in report.
- Do not upgrade uncertainty or assign confidence that is absent from the built-in report.
- Do not infer source mappings from proximity or plausibility.
