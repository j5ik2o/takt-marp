{extends:fix}

delivery verification finding だけを修正してください。

**やること:**
1. `review/deliver-verify.md` の finding を読み、delivery artifact の存在、path、readability、unrequested artifact の問題だけを扱ってください。
2. 必要に応じて `dist/<deck>/` の clean と再buildを行ってください。
3. visual/layout/content/design-token の問題は修正せず、polish command の範囲として記録してください。
4. `review/deliver-fix.md` に finding ごとの対応結果を書いてください。

**判定基準:**
- delivery finding をすべて反映または理由付きで非対応にした場合は `fixed` としてください。
- 安全に修正できない場合は `blocked` としてください。

**report file format:**
- `review/deliver-fix.md` は YAML front matter で開始し、`command: deliver`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: fix`、`cycle`、`state: fixed`、`result`、`applied_finding_count`、`rejected_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Delivery Fix
- Result: fixed / blocked
- Applied findings:
- Rejected findings:
- Files changed:
- Blocking issues:
