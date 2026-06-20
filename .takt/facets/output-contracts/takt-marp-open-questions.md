# Open Questions Artifact

この report は `slides/<deck>/research/open-questions.md` として同期される built-in report 派生 index artifact です。

## 出力形式

- 先頭は YAML front matter の `---` で始めてください。
- front matter は scalar / inline-array subset のみを使い、nested object は使わないでください。
- `source_report: research-report.md` と `source_report_origin: builtin_deep_research` を必ず含めてください。
- built-in report 内で確認できない値は推測せず、literal `not_present_in_builtin_report` を書いてください。

```markdown
---
command: research
target: slides/<deck>
generated_at: 2026-01-01T00:00:00.000Z
workflow_run_id: takt-run-id
source_report: research-report.md
source_report_origin: builtin_deep_research
---

# Open Questions

## Questions

| question_id | question | why_it_matters | suggested_next_step |
|-------------|----------|----------------|---------------------|
| question-001 | Example unresolved gap from the built-in report | not_present_in_builtin_report | not_present_in_builtin_report |

## Caveats

- why_it_matters または suggested_next_step が built-in report にない場合は `not_present_in_builtin_report` とする。
```

## Required Fields

- `question_id`: stable local ID such as `question-001`
- `question`: unresolved gap or open question that appears in the built-in report
- `why_it_matters`: reason from the built-in report, or `not_present_in_builtin_report`
- `suggested_next_step`: next step from the built-in report, or `not_present_in_builtin_report`

## Constraints

- Do not add open questions that are absent from the built-in report.
- Do not resolve gaps with new research or assumptions.
- Do not fabricate next steps when the built-in report does not state them.
