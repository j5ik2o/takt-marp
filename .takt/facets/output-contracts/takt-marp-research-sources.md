# Research Sources Artifact

この report は `slides/<deck>/research/research-sources.md` として同期される built-in report 派生 index artifact です。

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

# Research Sources

## Sources

| source_id | title | url | retrieved_at | source_type | confidence |
|-----------|-------|-----|--------------|-------------|------------|
| source-001 | Example title | not_present_in_builtin_report | not_present_in_builtin_report | web | not_present_in_builtin_report |

## Caveats

- URL、取得日、source_type、confidence が built-in report にない場合は `not_present_in_builtin_report` とする。
```

## Required Fields

- `source_id`: stable local ID such as `source-001`
- `title`: title or `not_present_in_builtin_report`
- `url`: source URL or `not_present_in_builtin_report`
- `retrieved_at`: retrieval date/time or `not_present_in_builtin_report`
- `source_type`: `web` / `document` / `codebase` / `other`
- `confidence`: `high` / `medium` / `low` / `not_present_in_builtin_report`

## Constraints

- Do not add sources that are absent from the built-in report.
- Do not fabricate URLs, retrieval dates, titles, or confidence.
- Do not re-evaluate source credibility beyond what the built-in report states.
