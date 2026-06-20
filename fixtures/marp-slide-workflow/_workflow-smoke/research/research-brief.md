# Workflow Smoke Research Brief

## Research Goal
Validate that the optional research command can synchronize built-in deep research output into deck-local research artifacts before planning.

## Scope
- Use only deterministic mock research content.
- Preserve missing source URL, retrieval time, confidence, and claim-source mapping as absent information.
- Do not infer or supplement facts that are not present in the built-in research report.

## Expected Consumer
The subsequent plan command may read the generated research artifacts as optional context, while still using `brief.md` as the primary input.
