{extends:supervisor-validation}

`research-supervision.md` must describe the slide research command result using flat YAML front matter.

Read `.takt/workflow-current-target.json` before writing front matter. Use marker `target` as the user-facing target. The front matter target must not be marker `research_brief_path`, `slides/<deck>/research/research-brief.md`, or any TAKT internal target.

The report file must begin with this YAML front matter. `generated_at` must be parseable, `workflow_run_id` must be non-empty, `step` must be `supervision`, `cycle` must be a number, and finding counts must be numbers.

```markdown
---
command: research
target: slides/<deck>
generated_at: 2026-01-01T00:00:00.000Z
workflow_run_id: takt-run-id
step: supervision
cycle: 1
state: researched
result: passed | rejected
blocking_findings: 0
major_findings: 0
minor_findings: 0
info_findings: 0
---

# Research Supervision Report

## Summary
{最終判定を要約}

## Boundary Check
| Check | Result | Notes |
|-------|--------|-------|

## Handoff Marker
| Field | Value |
|-------|-------|
| target | slides/<deck> |
| research_brief_path | slides/<deck>/research/research-brief.md |
| research_output_dir | slides/<deck>/research |

## Finding Counts
| Severity | Count | Notes |
|----------|-------|-------|

## Next Step
{passed: plan で任意参照可能 / rejected: research を再実行して修正}
```

For `result: passed`, `state` must be `researched`. For `result: rejected`, `state` must remain non-empty so the validator can read the artifact and the runner can archive it for rerun.
