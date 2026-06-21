Research Source Report Reuse の実行結果を確認し、`research-supervision.md` を出力してください。

## Handoff Marker

- Read `.takt/workflow-current-target.json` before writing the report.
- Require marker `research_reuse: true`.
- Use marker `target` as the user-facing target in front matter.
- Do not use marker `research_brief_path` or the TAKT target `slides/<deck>/research/research-brief.md` as the report target.
- Use marker `research_output_dir` only to verify that research artifacts belong under `slides/<deck>/research/`.
- Require marker `research_source_report_path` to point at the deck-local copied `research-report.md`.
- Require marker `research_source_report_origin: builtin_deep_research`.

## Boundary Checks

- Confirm that this reuse workflow did not rerun external research and only adapted the existing source report.
- Confirm that local reuse work only adapted the copied source report and supervised the reuse boundary.
- Treat copied built-in research behavior, local web access enablement, or additional research during reuse as boundary violations.
- Treat a missing or malformed handoff marker as a rejection.

## Output

Create exactly one report artifact in the current Report Directory:

- `research-supervision.md`

The report must follow the `takt-marp-research-supervision` output contract. Use flat YAML front matter. For a passed result, write `state: researched`. For a rejected result, write a non-empty remediation state and finding counts that explain why rerun is allowed.
