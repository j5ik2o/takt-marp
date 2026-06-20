research wrapper の実行結果を確認し、`research-supervision.md` を出力してください。

## Handoff Marker

- Read `.takt/workflow-current-target.json` before writing the report.
- Use marker `target` as the user-facing target in front matter.
- Do not use marker `research_brief_path` or the TAKT target `slides/<deck>/research/research-brief.md` as the report target.
- Use marker `research_output_dir` only to verify that research artifacts belong under `slides/<deck>/research/`.

## Boundary Checks

- Confirm that the wrapper delegated research execution to the `deep_research` workflow_call step.
- Confirm that local wrapper work only adapted the built-in report and supervised the wrapper boundary.
- Treat copied built-in research behavior, local web access enablement, or additional research outside the built-in workflow as boundary violations.
- Treat a missing or malformed handoff marker as a rejection.

## Output

Create exactly one report artifact in the current Report Directory:

- `research-supervision.md`

The report must follow the `takt-marp-research-supervision` output contract. Use flat YAML front matter. For a passed result, write `state: researched`. For a rejected result, write a non-empty remediation state and finding counts that explain why rerun is allowed.
