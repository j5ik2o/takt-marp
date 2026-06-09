# Gap Analysis: slide-workflow-ai-quality-gate

Generated at: 2026-06-09T05:18:43Z

## Analysis Summary

- 4つの canonical workflow はすべて work 成功後に通常 review/inspect/verify へ直接遷移しており、AI antipattern gate の差し込み点は明確である。
- TAKT 0.43.0 と既存 `takt-sdd` 例は `kind: workflow_call` / callable subworkflow を使っているため、runtime 変更なしで実装できる可能性が高い。
- 主な gap は、gate workflow/facets/output contract の新設、4 workflow の routing 変更、runner の report sync 対象拡張、smoke/static validation の追加である。
- 既存 state model と approval ownership は維持できる。gate report は supervision state 判定へ混ぜず、通常 review 前の補助 evidence として扱うのが安全である。
- 最大の設計注意点は、subworkflow report が `.takt/runs/.../reports/subworkflows/...` に namespaced される可能性と、deck-local `review/` へ同期するか current run 内 evidence として参照するかの選択である。

## Document Status

- Requirements are generated but not approved. Gap analysis proceeds because this is a brownfield workflow integration and the findings may inform requirement revisions.
- Core steering files `product.md`, `tech.md`, `structure.md` are absent. The analysis uses `.kiro/steering/roadmap.md`, existing specs, workflow YAML, facets, scripts, TAKT built-ins, and the referenced `takt-sdd` AI quality gate pattern.
- External dependency research was limited to local installed `takt` package and the referenced public `takt-sdd` workflow. No new dependency is required by the current requirements.

## Current State Investigation

### Existing Workflow Shape

The repository currently has exactly four canonical workflow files:

- `.takt/workflows/takt-marp-slide-plan.yaml`
- `.takt/workflows/takt-marp-slide-compose.yaml`
- `.takt/workflows/takt-marp-slide-polish.yaml`
- `.takt/workflows/takt-marp-slide-deliver.yaml`

Each workflow has a closed internal work/review/fix/supervision loop:

| Command | Work step | Current success route | Normal review step | Fix route |
| --- | --- | --- | --- | --- |
| `plan` | `summarize_plan_work` | `review_plan` | `review_plan` | `fix_plan -> summarize_plan_work` |
| `compose` | `summarize_compose_work` | `review_compose` | `review_compose` | `fix_compose -> summarize_compose_work` |
| `polish` | `render_evidence` | `inspect_render` | `inspect_render` | `fix_polish -> render_evidence` |
| `deliver` | `build_delivery` | `verify_delivery` | `verify_delivery` | `fix_delivery -> build_delivery` |

The existing loop monitors watch the normal review/fix/work cycles and route nonproductive loops to `ABORT`. This matches the requirement that the AI gate must not replace normal review/fix/supervision.

### Existing Report Contracts

The existing output contracts are:

- `takt-marp-command-work`
- `takt-marp-command-review`
- `takt-marp-command-fix`
- `takt-marp-supervision`

They already require YAML front matter with `command`, `target`, `generated_at`, `workflow_run_id`, `step`, `cycle`, and result/count fields. This provides a reusable report style for AI gate reports, but there is no AI-specific review/fix contract today.

### Existing Parser and State Validation

`scripts/lib/takt-marp-slide-workflow.mjs` provides:

- `COMMANDS = ["plan", "compose", "polish", "deliver"]`
- target resolver for `slides/<deck>`
- front matter parser for scalar values and inline arrays
- supervision and approval validation
- command prerequisite checks
- archive and cleanup helpers

This parser can support AI gate report validation if the gate report front matter stays within the documented subset. The state model currently validates only supervision and approval; AI gate reports should remain outside successful command state semantics.

### Existing Runner Report Sync

`scripts/takt-marp-run-slide-workflow.mjs` syncs reports from the successful TAKT run directory into `slides/<deck>/review/`. The synced filenames are fixed:

- `<command>-work.md`
- `<command>-review.md`
- `<command>-inspect.md`
- `<command>-verify.md`
- `<command>-fix.md`
- `<command>-supervision.md`
- `<command>-loop-monitor.md`

Gap: AI gate reports would not be copied to deck-local `review/` unless the runner sync list is extended or the design intentionally keeps subworkflow evidence inside `.takt/runs/.../reports/subworkflows/...`.

### Existing Validation

`scripts/takt-marp-validate-slide-workflow-smoke.mjs` already performs static workflow checks:

- loop monitor placement and route expectations
- approved route to supervision
- absence of old deck-local loop monitor facets
- absence of unsupported `quality_gates` command object shape and `{task}` interpolation

Gap: there is no check that AI gate steps exist before normal review/inspect/verify, that `COMPLETE` routes to normal review, `need_replan` routes to the owning work step, and `ABORT` routes to abort.

### Callable Workflow Support

The installed `takt` package includes built-in workflows using:

```yaml
kind: workflow_call
call: default-draft
```

The referenced `takt-sdd` workflow uses:

```yaml
- name: ai-quality-gate-discovery
  kind: workflow_call
  call: ./kiro-discovery-ai-quality-gate.yaml
  args:
    fix_instruction: kiro-ai-antipattern-fix-discovery
    domain_knowledge:
      - architecture
  rules:
    - condition: COMPLETE
      next: report-discovery
    - condition: need_replan
      next: plan-discovery-artifacts
    - condition: ABORT
      next: ABORT
```

The callable subworkflow itself declares `subworkflow.callable: true`, `visibility: internal`, `returns: [need_replan]`, a review step, a fix step, and a request-replan step. This is a direct pattern match for the requested gate.

## Requirement-to-Asset Map

| Requirement | Existing assets | Gap | Notes |
| --- | --- | --- | --- |
| R1 Gate coverage before normal review | Four canonical workflow YAMLs | Missing AI gate call step in all four workflows | Success route from work step must go to gate, not normal review. |
| R2 AI antipattern review outcome | `takt-sdd` `ai-antipattern-review` pattern; existing reviewer personas/policies | Missing Marp-specific AI review instruction/policy/report format | Need classify AI-specific defects without duplicating normal slide quality review. |
| R3 Gate fix and replan routing | Existing fix-loop routing and `takt-sdd` AI fix pattern | Missing command-local AI fix instruction and `need_replan` caller routes | Need map `need_replan` back to owning work step for each command. |
| R4 Gate report evidence and freshness | front matter parser; `workflow_run_id` convention; report sync code | Missing AI gate report contract and freshness validator | Decide whether deck-local reports are synced or current run subworkflow reports are referenced. |
| R5 Boundary preservation | Existing command/state model, approval model, normal review/fix/supervision | Constraint, not missing core capability | Design must keep AI gate outside human approval and successful state semantics. |
| R6 Validation/regression coverage | `slide:smoke`, static workflow checks, schema compatibility check | Missing AI gate placement/routing/report evidence checks | Existing smoke script is the natural home for static and smoke assertions. |

## Explicit Gaps

### Missing Capabilities

- `.takt/workflows/takt-marp-slide-ai-quality-gate.yaml` or equivalent internal callable workflow.
- AI antipattern reviewer/fix instructions under `.takt/facets/instructions/`.
- AI gate output contract(s) under `.takt/facets/output-contracts/`.
- Optional AI-specific policy or persona if existing reviewer/reviser personas are too slide-quality-oriented.
- Four caller workflow steps and route changes.
- Runner report sync support for AI gate evidence, unless design keeps evidence only under TAKT run directories.
- Static validation for gate placement and outcome routing.
- Smoke validation evidence that AI gate reports can be produced and associated with the active command run.

### Constraints

- Do not introduce object-shaped `quality_gates`; this repo already validates that those schema constructs are incompatible with string-only quality gate schemas.
- Do not change `COMMANDS`, `COMMAND_STATES`, approval ownership, or successful state semantics.
- Do not require external web access. Existing slide workflows set `network_access: false`; the AI gate should inherit this unless a later design explicitly narrows an exception, but requirements say web access must not be standard success condition.
- Keep report front matter within the existing parser subset: no nested objects, no multiline arrays, no YAML features beyond the documented scalar/inline-array subset.
- Current runner sync finds the successful TAKT run by matching `<command>-supervision.md`. AI gate evidence cannot become the run selector without changing runner semantics.

### Unknowns / Research Needed

- Exact TAKT report layout for nested `workflow_call` output in this repository at runtime: `reports/subworkflows/...` vs top-level report copy behavior should be verified during design or tasks.
- Whether TAKT exposes subworkflow reports to caller steps directly enough for normal review instructions to cite them without deck-local sync.
- Whether one generic AI fix instruction can safely handle all four command boundaries through parameters, or whether command-specific instructions are clearer and less error-prone.

## Implementation Approach Options

### Option A: Extend Existing Workflows Only

Add `workflow_call` steps directly to the four existing workflows and reuse existing facets as much as possible.

Files likely changed:

- `.takt/workflows/takt-marp-slide-plan.yaml`
- `.takt/workflows/takt-marp-slide-compose.yaml`
- `.takt/workflows/takt-marp-slide-polish.yaml`
- `.takt/workflows/takt-marp-slide-deliver.yaml`
- minimal new gate workflow/facet files

Trade-offs:

- Pros: smallest routing change; matches current canonical workflow layout.
- Pros: easy to reason about gate placement.
- Cons: without new validation and runner sync changes, report evidence/freshness requirements remain weak.
- Cons: repeated args/routes in four files can drift.

Effort: M. Risk: Medium, because it touches all workflow YAML and depends on subworkflow report behavior.

### Option B: New Gate Workflow plus Dedicated Validation/Sync Support

Create a Marp-specific callable gate workflow and report contracts, insert it into all four workflows, and extend runner/smoke validation to make gate evidence observable.

Files likely changed:

- Option A workflow files
- `.takt/workflows/takt-marp-slide-ai-quality-gate.yaml`
- `.takt/facets/instructions/takt-marp-ai-antipattern-review.md`
- `.takt/facets/instructions/takt-marp-ai-antipattern-fix.md` or command-specific fix instructions
- `.takt/facets/output-contracts/takt-marp-ai-antipattern-review.md`
- `.takt/facets/output-contracts/takt-marp-ai-antipattern-fix.md`
- `scripts/takt-marp-run-slide-workflow.mjs`
- `scripts/takt-marp-validate-slide-workflow-smoke.mjs`

Trade-offs:

- Pros: satisfies report evidence and regression coverage requirements directly.
- Pros: keeps state semantics intact while making gate evidence available.
- Pros: validates the exact failure mode from the previous `quality_gates` schema bug.
- Cons: more files and more integration points.
- Cons: design must decide how deck-local AI report names avoid collisions across commands and cycles.

Effort: M. Risk: Medium. This is the most complete path but requires careful report naming and sync behavior.

### Option C: Keep Gate Evidence Only in TAKT Run Directories

Insert callable gate workflow steps but do not copy AI gate reports into `slides/<deck>/review/`. Instead, update normal review instructions and validation to look at current run namespaced subworkflow reports.

Trade-offs:

- Pros: aligns with `takt-sdd` pattern where subworkflow evidence is namespaced under current run.
- Pros: avoids cluttering deck-local `review/` with auxiliary gate reports.
- Cons: current runner only syncs deck reports after overall success, and downstream human inspection may not have stable deck-local evidence.
- Cons: smoke validation becomes more coupled to TAKT run directory layout.
- Cons: requirement R4 asks for reports attributable to target/command/workflow run; deck-local absence may be surprising for operators.

Effort: M. Risk: Medium-High, because run directory layout and current-run discovery become central to validation.

## Recommended Design Direction

Prefer Option B as the design baseline:

- Use a new internal callable workflow for the AI gate.
- Insert one gate call step in each canonical workflow immediately before normal review/inspect/verify.
- Keep `COMPLETE -> normal review`, `need_replan -> owning work step`, `ABORT -> ABORT`.
- Add dedicated AI gate report contracts with flat YAML front matter.
- Extend the runner or validator so AI gate evidence can be associated with the active command run.
- Add static smoke checks for route order and route outcomes.

This approach best satisfies all requirements while preserving the existing command/state model. Option C remains viable if design confirms TAKT namespaced subworkflow reports are stable and easier to consume than deck-local copies.

## Design Phase Decisions to Make

1. Report location: deck-local `slides/<deck>/review/<command>-ai-antipattern-review.md` vs TAKT run namespaced reports.
2. Report naming: per-command filenames are safer for sync and stale cleanup than shared `ai-antipattern-review.md`.
3. Fix instruction shape: one parameterized instruction vs four command-specific instructions.
4. Validation level: static-only gate placement check vs smoke-run evidence check that exercises the callable gate.
5. Loop monitor scope: whether AI gate subworkflow keeps its own loop monitor only, or caller loop monitors also include the gate step.

## Risks

- If subworkflow reports are not top-level synced, normal review may pass without durable gate evidence unless runner/validation handles namespaced reports.
- If AI fix writes broad changes, it can violate command boundaries. The fix instruction must explicitly constrain the editable artifact set by command.
- If AI gate report uses rich YAML syntax, the existing parser will reject it or future validation will need a parser dependency, which the roadmap discourages.
- If route validation checks only presence and not order, a workflow could contain a gate but still bypass it.
- If gate reports share filenames across commands, stale report cleanup and cross-command evidence checks become fragile.

## Effort and Risk

- Overall effort: M (3-7 days). The implementation uses existing workflow/facet/script patterns but touches multiple workflow files and validation paths.
- Overall risk: Medium. The TAKT callable pattern exists, but report evidence handling and route validation need careful integration.

## Next Steps

- Review whether requirements should explicitly decide deck-local vs TAKT run namespaced gate evidence. If not, leave it as design decision.
- Proceed to `$kiro-spec-design slide-workflow-ai-quality-gate` after requirements approval.
- In design, include a small proof point or task to verify actual TAKT subworkflow report layout before finalizing report sync behavior.

---

# Design Discovery Update

Generated at: 2026-06-09T05:22:55Z

## Summary

- **Feature**: `slide-workflow-ai-quality-gate`
- **Discovery Scope**: Extension / Complex Integration
- **Key Findings**:
  - TAKT 0.43.0 already contains `workflow_call`, built-in `ai-antipattern-review` instruction/policy/persona, and `loop-monitor-ai-antipattern-fix`, so the design can adopt TAKT-native gate mechanics instead of inventing a command gate schema.
  - The built-in `ai-antipattern-review` output contract does not include the deck-local front matter required by this spec. Marp-specific AI gate review/fix output contracts are needed.
  - The existing runner syncs only top-level command reports. Because callable workflow evidence may be namespaced under `.takt/runs/<run>/reports/subworkflows/`, the runner must copy current gate reports to deck-local per-command filenames.

## Research Log

### Callable gate compatibility

- **Context**: Requirements depend on a callable AI quality gate before normal review.
- **Sources Consulted**: `node_modules/takt/builtins/*/workflows/default.yaml`, `node_modules/takt/builtins/*/workflows/default-draft.yaml`, `takt-sdd` `kiro-discovery.yaml`, local `package.json`.
- **Findings**:
  - Installed TAKT version is `^0.43.0`.
  - Built-in workflows use `kind: workflow_call`.
  - `takt-sdd` uses the same shape with an internal callable AI quality gate and `need_replan` return.
- **Implications**:
  - No TAKT runtime change is part of this design.
  - The repo should avoid `quality_gates` command objects because they are unrelated to callable subworkflow routing and previously caused schema incompatibility.

### AI antipattern facet reuse

- **Context**: The gate should classify AI-specific issues without replacing normal slide review.
- **Sources Consulted**: `node_modules/takt/builtins/ja/facets/instructions/ai-antipattern-review.md`, `node_modules/takt/builtins/ja/facets/policies/ai-antipattern.md`, local `.takt/facets/instructions/*`.
- **Findings**:
  - TAKT built-ins already define the AI antipattern review criteria and loop-monitor instruction.
  - Existing Marp workflow facets define command-local worker boundaries, slide quality, SVG policy, and report styles.
- **Implications**:
  - Reuse built-in AI antipattern criteria and local Marp boundary policies together.
  - Add local Marp-specific review/fix instructions only to bind target, command, reviewed scope, and deck-local report fields.

### Evidence persistence

- **Context**: Requirements require fresh, attributable AI gate reports and smoke validation evidence.
- **Sources Consulted**: `scripts/takt-marp-run-slide-workflow.mjs`, `scripts/lib/takt-marp-slide-workflow.mjs`, `scripts/takt-marp-validate-slide-workflow-smoke.mjs`.
- **Findings**:
  - Runner selects a successful TAKT run by matching `<command>-supervision.md`.
  - Runner currently copies only fixed command report filenames into `slides/<deck>/review/`.
  - Static smoke validation already checks workflow routing, loop monitors, and known schema hazards.
- **Implications**:
  - AI gate reports should not select the run, but should be copied after the run is selected.
  - Per-command deck-local filenames avoid stale cross-command report ambiguity.
  - Smoke validation should check both route order and deck-local report association.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Callable gate plus deck-local sync | Insert an internal `workflow_call` step and sync gate evidence into `slides/<deck>/review/` | Meets gate, freshness, and operator evidence requirements | Requires runner subworkflow report discovery | Selected |
| Callable gate with run-only evidence | Keep evidence under `.takt/runs/.../reports/subworkflows/` | Least deck-local clutter | Smoke and operators depend on run layout | Rejected for current requirements |
| Object-shaped `quality_gates` | Use workflow quality gate objects | Looks like direct command validation | Known schema incompatibility and not callable routing | Rejected |

## Design Decisions

### Decision: deck-local AI gate evidence

- **Context**: The gate must be attributable to target, command, and current workflow run.
- **Alternatives Considered**:
  1. Keep subworkflow evidence only in TAKT run directories.
  2. Copy current gate evidence to deck-local per-command report files.
- **Selected Approach**: Copy current gate reports to `slides/<deck>/review/<command>-ai-antipattern-review.md` and optional `<command>-ai-antipattern-fix.md`.
- **Rationale**: This matches existing operator-facing report behavior while preserving supervision state ownership.
- **Trade-offs**: Runner needs subworkflow report discovery, but validation becomes simpler and stale reports can be cleaned with the command report set.
- **Follow-up**: Verify actual subworkflow report path in implementation and support only the observed current TAKT layout.

### Decision: local output contracts for Marp gate reports

- **Context**: Built-in AI review format lacks the strict front matter required by the spec.
- **Alternatives Considered**:
  1. Use built-in `ai-antipattern-review` format unchanged.
  2. Define local Marp AI gate review/fix contracts with flat YAML front matter.
- **Selected Approach**: Define local `takt-marp-ai-antipattern-review` and `takt-marp-ai-antipattern-fix` contracts.
- **Rationale**: Existing parser and smoke validation can read flat front matter without new dependencies.
- **Trade-offs**: More local facet files, but report freshness and command ownership become explicit.
- **Follow-up**: Keep body tables compatible with built-in finding concepts where possible.

### Decision: generic callable gate with command-bound fix instruction

- **Context**: AI antipatterns occur in all four commands, but command boundaries differ.
- **Alternatives Considered**:
  1. Four separate gate workflows.
  2. One gate workflow with a `fix_instruction` facet parameter.
- **Selected Approach**: One `takt-marp-slide-ai-quality-gate.yaml` workflow accepts a command-local fix instruction facet.
- **Rationale**: Mirrors `takt-sdd`, avoids four near-duplicate workflows, and keeps command boundary details in instructions.
- **Trade-offs**: The fix instruction must read `.takt/workflow-current-target.json` and command reports carefully.
- **Follow-up**: Use static validation to ensure all caller routes pass the expected command-specific fix instruction.

## Synthesis Outcomes

- **Generalization**: All four commands need the same gate lifecycle: work success -> AI review -> optional AI fix loop -> normal review or replan. The design generalizes the lifecycle into one callable workflow while keeping command-specific ownership in caller routes and fix instructions.
- **Build vs Adopt**: Adopt TAKT `workflow_call`, built-in AI antipattern criteria, and existing front matter parser. Build only the Marp report contracts, fix instruction, runner sync, and validation hooks that are specific to this repository.
- **Simplification**: Do not add a new top-level command, state enum, approval artifact, or YAML parser. Gate evidence is auxiliary report data, not command state.

## Risks & Mitigations

- Subworkflow report path differs from expectation — verify against actual `.takt/runs` output and fail smoke validation if current gate evidence cannot be associated.
- Gate fix crosses command boundaries — command-local fix instruction must list allowed artifacts and route unsafe changes to `need_replan`.
- Flat front matter cannot represent detailed finding decisions — keep counts in front matter and detailed decisions in Markdown tables.
- Gate route exists but is bypassed — static validation must assert ordered work -> gate -> normal review sequence, not just presence.

## References

- `node_modules/takt/builtins/ja/facets/policies/ai-antipattern.md` — AI antipattern criteria adopted by the gate.
- `node_modules/takt/builtins/ja/facets/instructions/loop-monitor-ai-antipattern-fix.md` — loop monitor instruction adopted by the gate.
- `scripts/takt-marp-run-slide-workflow.mjs` — report sync boundary extended by this design.
- `scripts/takt-marp-validate-slide-workflow-smoke.mjs` — static workflow validation boundary extended by this design.
