MUST:
- 先頭は必ず YAML front matter の `---` で始め、`source_artifact_count` の直後に閉じ `---` を置いてから Markdown body を書く。
- front matter より前に説明文、警告、作業メモを書かない。
- Markdown body を front matter に混ぜない。`# Command Work Report` は閉じ `---` の後に置く。

```markdown
---
command: plan | compose | polish | deliver
target: slides/<deck>
generated_at: 2026-01-01T00:00:00.000Z
workflow_run_id: takt-run-id
step: work
cycle: 1
state: worked
result: passed | needs_input | failed
source_artifact_count: 0
---

# Command Work Report

## Summary
{1-2文で作業結果を要約}

## Source Artifacts
| File | State | Notes |
|------|-------|-------|

## Requested Deliverables
- html
- pdf
- pptx

## Machine Checks
| Check | Result | Notes |
|-------|--------|-------|

## Human Review Points
- None / {人間承認前に確認すべき判断}

## Blocking Issues
- None / {継続不能な不足}
```
