built-in deep research の report を slide workflow 用の index artifacts に変換してください。

## Input Boundary

- Read `.takt/workflow-current-target.json` before writing any report artifact.
- The only input is the built-in `research-report.md`.
- In normal mode, read the built-in `research-report.md` from the current TAKT run.
- In reuse mode, marker `research_reuse: true` means read marker `research_source_report_path`, which must point at the deck-local copied `research-report.md`.
- Treat the handoff marker as target metadata only, not as research content.
- Use marker `target` as the user-facing target in every artifact front matter `target`.
- The front matter `target` must not be marker `research_brief_path`, `slides/<deck>/research/research-brief.md`, or any TAKT internal target.
- Read the built-in report as the source of truth. Do not use deck brief, old research artifacts, browser state, local cache, or external search results to fill gaps.
- In reuse mode, keep `source_report_origin: builtin_deep_research`; do not describe the deck-local copy as adapter-generated.
- Forbidden: web fetch, additional research, source re-evaluation, invented claims.
- Do not copy or regenerate `research-report.md`. It remains the built-in source report and will be synced by the runner in a later task.

## Output

Create exactly these report artifacts in the current Report Directory:

- `research-sources.md`
- `research-claims.md`
- `open-questions.md`

Each artifact must follow its bound output contract and use YAML front matter in the scalar/inline-array subset only. Use `source_report: research-report.md` and `source_report_origin: builtin_deep_research`.

## Extraction Rules

- `research-sources.md`: Extract only sources that are explicitly present in the built-in report. If URL, retrieved_at, title, source type, or confidence is not present in the built-in report, write the literal `not_present_in_builtin_report`.
- `research-claims.md`: Extract only claims, findings, or conclusions that are explicitly present in the built-in report. If confidence or claim/source mapping is not present in the built-in report, write `confidence: not_present_in_builtin_report`, `source_ids: []`, and add a caveat containing `not_present_in_builtin_report`.
- `open-questions.md`: Extract only unresolved gaps or open questions explicitly present in the built-in report. If why_it_matters or suggested_next_step is not present in the built-in report, write `not_present_in_builtin_report`.
- Do not infer source IDs from nearby text. Source IDs must be stable local IDs assigned to entries that exist in the built-in report, such as `source-001`.
- Do not invent plausible URLs, retrieval dates, source names, confidence, or claims.

## Completion Criteria

- Missing URL, retrieved_at, claim/source mapping, and confidence remain visible as `not_present_in_builtin_report` or as caveats.
- Information absence alone is not a failure. Fail only when the built-in source report cannot be read, handoff/front matter is unusable, or the required output files cannot be generated.
