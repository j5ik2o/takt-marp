# ADR 0001: Slide Workflow Command State Foundation

## Status

Accepted

## Context

The old Marp slide workflow exposed `draft`, `review-revise`, and `build-qa` as user-facing commands. Those names leaked internal review, fix, and QA mechanics into the public command surface.

## Decision

The canonical user-facing commands are:

- `plan`
- `compose`
- `polish`
- `deliver`

The command target is always `slides/<deck>`. Markdown file targets such as `slides/<deck>/brief.md` are rejected before TAKT starts.

Human approval is represented by approval files for `plan` and `compose` only. TAKT workflow agents read approval state but do not create approval files.

State is determined from YAML front matter in canonical reports and approvals. File existence and free-form report prose are not sufficient.

## Consequences

- `package.json` exposes wrapper scripts instead of direct TAKT workflow invocation.
- Runner preflight can reject invalid targets, missing approvals, stale approvals, successful reruns, and force invalidation before TAKT starts.
- `slide-workflow-orchestration` can focus on TAKT YAML and facets while relying on deterministic foundation scripts.
