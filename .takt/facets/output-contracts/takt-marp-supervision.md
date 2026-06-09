{extends:supervisor-validation}

The report file must begin with this YAML front matter. Use the short command name in `command`; do not use workflow names such as `takt-marp-slide-plan` or step names such as `supervise_plan`. Use `target: slides/<deck>`; do not use a `deck` key. `generated_at` must be parseable, `workflow_run_id` must be non-empty, `step` must be `supervision`, and `cycle` must be a number.

```markdown
---
command: plan | compose | polish | deliver
target: slides/<deck>
generated_at: 2026-01-01T00:00:00.000Z
workflow_run_id: takt-run-id
step: supervision
cycle: 1
state: planned | composed | polished | delivered
result: passed | rejected
human_gate: required | not_required
approval_required: true | false
approval_file: review/plan-approval.md | review/compose-approval.md | null
blocking_findings: 0
major_findings: 0
minor_findings: 0
info_findings: 0
waived_major_findings: 0
decision_items_count: 0
---

# Supervision Report

## Summary
{最終判定を要約}

## Boundary Check
| Check | Result | Notes |
|-------|--------|-------|

## Finding Counts
| Severity | Count | Notes |
|----------|-------|-------|

## Approval
| Field | Value |
|-------|-------|

## Next Step
{approval command / next workflow / remediation}
```
