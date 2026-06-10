polish command の render evidence を生成し、source artifact を表示確認できる状態にしてください。

**やること:**
1. 対象 target は `slides/<deck>` として扱ってください。
2. `node scripts/takt-marp-render-slide-workflow-evidence.mjs <target> --cycle 1` を実行し、metadata の出力先を初期化してください。
3. Marp HTML/PDF と必要な raster evidence を `.takt/render/<deck>/cycle-1/` 配下へ生成し、`metadata.json` の `html_png`、`pdf`、`pdf_raster` を `pending` 以外の完了状態へ更新してください。
4. `.takt/render/<deck>/cycle-1/metadata.json` の生成結果を確認してください。
5. `review/polish-work.md` に render evidence の実行結果を記録してください。

**判定基準:**
- metadata が生成され、`target`、`cycle`、`html_png.status`、`pdf.status`、`pdf_raster.status` が確認できる場合だけ評価対象にしてください。
- `html_png` は slide PNG evidence なので、`passed` 相当の完了状態、空でない `files`、実在する非空ファイルが必要です。Puppeteer/Chromium missing、Marp image export failure、`failed`、`degraded`、`skipped` は `failed` としてください。
- `pdf` は source render evidence なので、`passed` 相当の完了状態、実在する非空 `file` が必要です。PDF生成失敗、`failed`、`degraded`、`skipped` は `failed` としてください。
- `pdftoppm` missing に限り `pdf_raster` の degraded/skipped と reason を許容し、単独では失敗にしないでください。
- `pending` status が残っている場合は render evidence が未完了なので `failed` としてください。
- metadata が生成されない、target/cycle が不一致、status field が欠ける場合は `failed` としてください。

**禁止事項**
- `dist/<deck>/` には書き込まないでください。
- plan-level content を変更しないでください。
- approval file を生成しないでください。

**report file format:**
- `review/polish-work.md` は YAML front matter で開始し、`command: polish`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: work`、`cycle`、`state: worked`、`result`、`source_artifact_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Render Evidence Result
- Result: passed / failed
- Metadata:
- HTML status:
- PDF status:
- PDF raster status:
- Degraded reasons:
- Blocking issues:
