MUST:
- 先頭は必ず YAML front matter の `---` で始め、`blocking_finding_count` の直後に閉じ `---` を置いてから Markdown body を書く。
- front matter より前に説明文、警告、作業メモを書かない。
- Markdown body を front matter に混ぜない。`# AI Antipattern Review Report` は閉じ `---` の後に置く。
- front matter は flat scalar のみを使う。nested object、multi-line array、finding detail は front matter に入れない。
- `finding_count` は AI Findings テーブルに記録した全 finding 行数と一致させる。
- `blocking_finding_count` は通常 review / inspect / verify へ進めない AI finding 行数と一致させる。
- finding がある場合は、各行に安定した `finding_id` と具体的な `evidence` を必ず書く。
- `result: approved` かつ `finding_count: 0` の初回 no-issue review は、fix report なしで有効な gate evidence とする。

```markdown
---
command: plan | compose | polish | deliver
target: slides/<deck>
generated_at: 2026-01-01T00:00:00.000Z
workflow_run_id: takt-run-id
step: ai_antipattern_review
cycle: 1
reviewed_scope: command-work-report | source-artifacts | render-evidence | delivery-artifacts
result: approved | needs_fix | blocked
finding_count: 0
blocking_finding_count: 0
---

# AI Antipattern Review Report

## Summary
{AI antipattern review の結果を1-2文で要約}

## Reviewed Scope
| artifact | role | evidence |
|----------|------|----------|

## AI Findings
| finding_id | family_tag | status | location | issue | required_change | evidence |
|------------|------------|--------|----------|-------|-----------------|----------|

## Non-AI Quality Notes
- None / {通常の slide content、layout、render、delivery 品質に属するため AI finding として扱わなかった観察}

## Blocking Issues
- None / {target、command output、reviewed scope を特定できない理由}
```
