# Requirements Document

## Introduction

`slide-workflow-ai-quality-gate` は、Marp slide workflow の `plan / compose / polish / deliver` すべてに、通常 review/inspect/verify へ進む前の AI antipattern quality gate を追加する feature です。AI agent が source artifact や report を生成する段階で、存在しない path/tool の前提、入力にない主張、過度な抽象化、指示外の後方互換追加、未検証の断定などが混入すると、通常 review が content や visual の品質確認ではなく AI 幻覚の後始末に使われてしまいます。

この feature は、各 command の work 成果物を通常 review 前に横断 gate で確認し、AI 特有の問題を専用 finding として扱えるようにします。修正可能な finding は command 境界内の fix loop で処理し、current command の境界内で安全に直せないものは replan route に戻します。曖昧な成功、stale report、cross-run evidence、finding-level evidence のない no-fix を許可しないことで、通常 review/fix/supervision の品質ループへ入る前の信用境界を作ります。

## Boundary Context

- **In scope**: 4つの canonical workflow すべてで通常 review/inspect/verify 前に AI antipattern gate を実行すること、AI antipattern review/fix report の期待契約、`COMPLETE / need_replan / ABORT` の caller-visible route、gate placement と report 証跡の smoke/static validation。
- **Out of scope**: TAKT runtime の callable workflow 実装変更、通常 review/inspect/verify の品質基準の再定義、command/state model や approval ownership の変更、deliverable enum の変更、外部 fact checking や web search の標準化、GitHub PR review automation との接続。
- **Adjacent expectations**: `slide-workflow-foundation` は target/state/report freshness を提供し、`slide-workflow-orchestration` は canonical workflow と通常 review/fix/supervision loop を提供し、`slide-workflow-smoke-validation` は end-to-end validation と integration issue の最小修正方針を提供する。この feature はそれらの意味論を再定義しない。

## Requirements

### Requirement 1: Gate coverage before normal review

**Objective:** As a workflow maintainer, I want every slide command to pass through an AI antipattern gate before normal review, so that AI-specific defects are caught before they pollute the command review loop.

#### Acceptance Criteria
1. When `plan` work output is ready for review, the slide workflow shall run an AI antipattern quality gate before `plan` review.
2. When `compose` work output is ready for review, the slide workflow shall run an AI antipattern quality gate before `compose` review.
3. When `polish` render evidence output is ready for inspection, the slide workflow shall run an AI antipattern quality gate before `polish` inspection.
4. When `deliver` build output is ready for verification, the slide workflow shall run an AI antipattern quality gate before `deliver` verification.
5. The slide workflow shall keep AI antipattern gate execution inside the canonical command workflow instead of exposing it as a separate top-level user command.

### Requirement 2: AI antipattern review outcome

**Objective:** As a slide workflow reviewer, I want AI-specific issues reported separately from normal content or visual findings, so that normal review can focus on the command's intended quality criteria.

#### Acceptance Criteria
1. When the AI antipattern gate reviews a command output, the gate shall classify hallucinated files, paths, tools, APIs, unsupported source claims, unrequested compatibility behavior, overbroad abstractions, and unused generated artifacts as AI-specific issues.
2. When the AI antipattern gate finds no AI-specific issues, the gate shall allow the caller workflow to continue to the normal review, inspection, or verification step.
3. When the AI antipattern gate finds AI-specific issues, the gate shall record stable finding identifiers and evidence for each issue before any fix step is considered successful.
4. If the AI antipattern gate cannot identify the reviewed target or command output, then the gate shall prevent the caller workflow from continuing to normal review as an approved outcome.
5. The AI antipattern gate shall not treat ordinary slide content, layout, render quality, or delivery artifact quality findings as AI-specific issues unless they are caused by AI-specific fabrication or unsupported assumptions.

### Requirement 3: Gate fix and replan routing

**Objective:** As a workflow maintainer, I want AI-specific findings to be fixed or routed before normal review, so that unresolved AI hallucination does not enter supervision as accepted work.

#### Acceptance Criteria
1. When an AI-specific issue can be corrected within the current command boundary, the AI antipattern gate shall require a fix result before returning to AI antipattern review.
2. When a fix result claims no fix is needed, the AI antipattern gate shall require finding-level evidence for every finding decision before allowing completion.
3. When an AI-specific issue cannot be corrected safely within the current command boundary, the AI antipattern gate shall return a replan outcome to the caller workflow.
4. When the caller workflow receives a replan outcome from the AI antipattern gate, the caller workflow shall route back to the command work step that owns the current artifact boundary.
5. If AI antipattern review or fix outcomes are ambiguous, internally inconsistent, blocked, or non-convergent, then the AI antipattern gate shall prevent the caller workflow from continuing to normal review as a successful outcome.

### Requirement 4: Gate report evidence and freshness

**Objective:** As a workflow operator, I want AI gate reports to be attributable and fresh, so that later review and smoke validation can trust the gate outcome.

#### Acceptance Criteria
1. When the AI antipattern gate writes a review report, the report shall identify the target deck, command, reviewed artifact scope, generated time, workflow run, and finding count.
2. When the AI antipattern gate writes a fix report, the report shall identify the handled finding decisions, changed files or `none`, validation evidence, and remaining missing context if any.
3. If an AI gate report belongs to a different target, command, or workflow run, then the slide workflow shall not treat that report as current gate evidence.
4. If a fix report marks findings as not applicable or already resolved without finding-level evidence, then the slide workflow shall not treat that fix report as a successful gate outcome.
5. The AI antipattern gate shall make first-pass no-issue reviews valid without requiring an optional fix report.

### Requirement 5: Existing workflow boundary preservation

**Objective:** As a slide workflow maintainer, I want the AI gate to reduce hallucination risk without changing existing command responsibilities, so that previous workflow contracts remain stable.

#### Acceptance Criteria
1. The slide workflow AI quality gate shall not replace the existing normal review, inspection, verification, fix, or supervision steps.
2. The slide workflow AI quality gate shall not generate human approval files.
3. The slide workflow AI quality gate shall not change `plan`, `compose`, `polish`, or `deliver` successful state semantics.
4. The slide workflow AI quality gate shall not expand `polish` into plan redesign or `deliver` into visual/layout inspection.
5. The slide workflow AI quality gate shall not require external web access as a standard success condition.
6. The slide workflow AI quality gate shall not introduce workflow schema constructs that are known to be incompatible with string-only quality gate schemas.

### Requirement 6: Gate validation and regression coverage

**Objective:** As a maintainer, I want the AI gate placement and routing to be validated before relying on it, so that future workflow edits do not silently bypass the hallucination guard.

#### Acceptance Criteria
1. When workflow validation runs, the validation shall confirm that all four canonical workflows include the AI antipattern gate before their normal review, inspection, or verification step.
2. When workflow validation runs, the validation shall confirm that AI gate completion routes to normal review, AI gate replan routes to the owning work step, and AI gate abort routes to workflow abort.
3. When smoke validation runs, the validation shall record evidence that AI gate report files can be produced and associated with the active command run.
4. If a workflow edit removes the AI antipattern gate from any canonical command, then the validation shall fail before the change is considered complete.
5. If a workflow edit routes AI gate outcomes to an unrelated command boundary, then the validation shall fail before the change is considered complete.
