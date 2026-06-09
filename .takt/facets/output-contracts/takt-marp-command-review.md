MUST:
- 先頭は必ず YAML front matter の `---` で始め、`blocking_finding_count` の直後に閉じ `---` を置いてから Markdown body を書く。
- front matter より前に説明文、警告、作業メモを書かない。
- Markdown body を front matter に混ぜない。`# Command Review Report` は閉じ `---` の後に置く。
- `finding_count` は Findings テーブルに記録した全 finding 行数と一致させる。info finding を表に載せる場合も数に含める。数に含めない観察は Findings ではなく Summary または別の非ブロッキングメモとして書く。

```markdown
---
command: plan | compose | polish | deliver
target: slides/<deck>
generated_at: 2026-01-01T00:00:00.000Z
workflow_run_id: takt-run-id
step: review | inspect | verify
cycle: 1
state: reviewed | inspected | verified
result: approved | needs_fix | blocked
finding_count: 0
blocking_finding_count: 0
---

# Command Review Report

## Summary
{レビュー結果を要約}

## Findings
| finding_id | severity | status | cycle | location | issue | required_change | evidence |
|------------|----------|--------|-------|----------|-------|-----------------|----------|

## Blocking Issues
- None / {判断不能な入力不足}
```
