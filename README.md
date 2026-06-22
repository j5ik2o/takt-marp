# takt-marp

[日本語](README.ja.md)

Marp slide decks and a TAKT workflow for semi-automated deck generation.

## TAKT Marp workflow

The workflow starts from `slides/<deck>/brief.md` and moves through `plan`, `compose`, `polish`, and `deliver`. Use optional `research` first only when a deck needs external research context.

Detailed workflow contract: [docs/marp-slide-workflow.md](docs/marp-slide-workflow.md)

### 1. Create a brief

Create `slides/<deck>/brief.md`. Commands take the deck directory `slides/<deck>`, not the `brief.md` file path.

Minimum sections:

- `Goal`
- `Core Message`
- `Audience Context`
- `Output Requirements`

Example output requirement:

```md
## Output Requirements
- Format: Marp
- Language: Japanese
- Target slide count: 5
- Deliverables: html, pdf
```

### 2. Run the workflows

```bash
takt-marp research "slides/<deck>"
takt-marp plan "slides/<deck>"
takt-marp approve "slides/<deck>" plan --by <name>
takt-marp compose "slides/<deck>"
takt-marp approve "slides/<deck>" compose --by <name>
takt-marp polish "slides/<deck>"
takt-marp deliver "slides/<deck>"
```

Use `slides/<deck>` as the target:

```bash
takt-marp plan "slides/<deck>"
```

Human approval is recorded by `takt-marp approve` for `plan` and `compose` only. `review`, `revise`, `qa`, and `build-qa` are internal workflow responsibilities, not top-level commands.
`research` reads `slides/<deck>/research/research-brief.md` and is not required before `plan`.

### 3. Generated files

```text
slides/<deck>/
  design/design-brief.md
  design/<claude-design-export>.zip
  brief.normalized.md
  plan.md
  slide-blueprint.md
  sections/*.md
  SLIDES.md
  images/*.svg
  research/*.md
  review/*.md
```

`design/design-brief.md` is the Design System authoring request given to Claude Design. It is derived from `brief.md` / `brief.normalized.md`, brand constraints, audience constraints, and style constraints. In the normal flow, generated `plan.md` / `slide-blueprint.md` files are not the primary input for Claude Design authoring.

`plan` and `compose` require exactly one Claude Design export zip under `slides/<deck>/design/`. The runner normalizes it into `.takt/design-contracts/<deck>/resolved-design-contract.json`; `plan` records metadata, fingerprints, guidance such as `SKILL.md` / `readme.md`, and the component/starting point/card/template/theme/font/sample catalog. Templates are cataloged from both manifest entries and `templates/**/*.dc.html` archive files. `compose` applies the same tokens and catalog to `SLIDES.md`, section HTML/CSS, and generated visual source. Each deck can use a different Design System, so the workflow must not assume a fixed domain or fixed component names. When `design/design-brief.md` exists, its fingerprint is recorded for drift detection. When it is missing, the workflow can continue and records Design Brief drift protection as unavailable.

### 4. Polish and delivery scope

`polish` is responsible for visual inspection and repair loops:

- SVG references and XML validity
- slide frame fit, text fit, figure size, page number interference
- layout choice and split ratios
- typography consistency: letter spacing, line height, size hierarchy
- spatial balance: top/left bias, large unintended blank areas, visual center of gravity
- Design Contract usage: tokenized CSS, no per-slide style drift

`deliver` is responsible for requested artifacts, delivery verification, and final supervision.
For simple local generation or inspection, use utility commands that do not change workflow state:

```bash
takt-marp build:html <deck>
takt-marp build:pdf <deck>
takt-marp preview <deck>
```

### 5. Validation

Use the smoke validation when changing workflow routing, state gates, render evidence, delivery verification, or approval handling:

```bash
takt-marp smoke --keep
```

The smoke validation creates a temporary `_workflow-smoke` deck from the fixture, exercises invalid target and approval failure paths, runs the `plan` -> `compose` -> `polish` -> `deliver` sequence, verifies render evidence metadata, checks delivery artifacts, and covers rerun/force behavior. `--keep` leaves the generated deck and reports under `slides/_workflow-smoke/` for inspection.

Real provider smoke can take longer than the default per-workflow timeout. For local verification, extend it with `TAKT_MARP_SMOKE_WORKFLOW_TIMEOUT_MS`, for example `TAKT_MARP_SMOKE_WORKFLOW_TIMEOUT_MS=7200000 npm run slide:smoke -- --provider claude --keep`.

### Smoke fixture

A small input fixture is available at:

```text
fixtures/marp-slide-workflow/_workflow-smoke/
```

Copy it under `slides/` when you want to run the full workflow without creating a new brief.
