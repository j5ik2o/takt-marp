MUST:
- 先頭は必ず YAML front matter の `---` で始め、`rejected_finding_count` の直後に閉じ `---` を置いてから Markdown body を書く。
- front matter より前に説明文、警告、作業メモを書かない。
- Markdown body を front matter に混ぜない。`# Command Fix Report` は閉じ `---` の後に置く。
- `applied_finding_count` と `rejected_finding_count` は Finding Responses テーブルの decision と一致させる。

```markdown
---
command: plan | compose | polish | deliver
target: slides/<deck>
generated_at: 2026-01-01T00:00:00.000Z
workflow_run_id: takt-run-id
step: fix
cycle: 1
state: fixed
result: fixed | blocked
applied_finding_count: 0
rejected_finding_count: 0
---

# Command Fix Report

## Summary
{修正結果を要約}

## Finding Responses
| finding_id | decision | files_changed | reason | verification |
|------------|----------|---------------|--------|--------------|

## Blocking Issues
- None / {安全に修正できない理由}
```
