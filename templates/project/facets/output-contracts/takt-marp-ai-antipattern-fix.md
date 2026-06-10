MUST:
- 先頭は必ず YAML front matter の `---` で始め、`remaining_context_count` の直後に閉じ `---` を置いてから Markdown body を書く。
- front matter より前に説明文、警告、作業メモを書かない。
- Markdown body を front matter に混ぜない。`# AI Antipattern Fix Report` は閉じ `---` の後に置く。
- front matter は flat scalar のみを使う。nested object、multi-line array、finding detail は front matter に入れない。
- `status` は `FIXED`、`NO_FIX_NEEDED`、`NEED_REPLAN`、`BLOCKED` のいずれかだけを使う。
- `handled_finding_count` は Finding Decisions テーブルに記録した finding 行数と一致させる。
- `changed_file_count` は Changed Files テーブルに記録した変更ファイル数と一致させる。変更がない場合は `0` とし、Changed Files には `none` を記録する。
- `remaining_context_count` は Remaining Context テーブルに記録した未解決 context 行数と一致させる。
- `NO_FIX_NEEDED` は、Finding Decisions のすべての行に finding-level evidence がある場合のみ有効とする。
- `NEED_REPLAN` または `BLOCKED` の場合は、Remaining Context に command 境界内で安全に解決できない理由を必ず書く。

```markdown
---
command: plan | compose | polish | deliver
target: slides/<deck>
generated_at: 2026-01-01T00:00:00.000Z
workflow_run_id: takt-run-id
step: ai_antipattern_fix
cycle: 1
status: FIXED | NO_FIX_NEEDED | NEED_REPLAN | BLOCKED
handled_finding_count: 0
changed_file_count: 0
remaining_context_count: 0
---

# AI Antipattern Fix Report

## Summary
{AI antipattern finding の修正結果を1-2文で要約}

## Finding Decisions
| finding_id | decision | changed_files | validation | evidence |
|------------|----------|---------------|------------|----------|

## Changed Files
| path | change_summary | evidence |
|------|----------------|----------|
| none | no file changes were required | {理由または finding-level evidence} |

## Validation Evidence
| command | result | evidence |
|---------|--------|----------|

## Remaining Context
| finding_id | missing_context | required_replan_owner | evidence |
|------------|-----------------|-----------------------|----------|
```
