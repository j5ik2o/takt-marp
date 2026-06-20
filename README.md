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
  brief.normalized.md
  plan.md
  design-system.md
  SLIDES.md
  images/*.svg
  research/*.md
  review/*.md
```

`design-system.md` defines deck-local typography, spacing, layout, visual, color, and QA tokens. `SLIDES.md` should use those tokens through Marp classes instead of per-slide style tweaks.

### 4. Polish and delivery scope

`polish` is responsible for visual inspection and repair loops:

- SVG references and XML validity
- slide frame fit, text fit, figure size, page number interference
- layout choice and split ratios
- typography consistency: letter spacing, line height, size hierarchy
- spatial balance: top/left bias, large unintended blank areas, visual center of gravity
- design-system usage: tokenized CSS, no per-slide style drift

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

### Smoke fixture

A small input fixture is available at:

```text
fixtures/marp-slide-workflow/_workflow-smoke/
```

Copy it under `slides/` when you want to run the full workflow without creating a new brief.
