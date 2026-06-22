official delivery artifact を build してください。

**やること:**
1. `plan.md` の `deliverables: [html, pdf, pptx]` を authoritative delivery request として読んでください。
2. export 前に `dist/<deck>/` を削除または空にしてください。
3. `html` が requested の場合は `npm run build:html -- <deck>` で生成してください。
4. `pdf` が requested の場合は `npm run build:pdf -- <deck>` で生成してください。
5. `pptx` が requested の場合だけ `npm run build:pptx -- <deck>` で生成してください。
6. `review/deliver-work.md` に `Cleaned directory:` として export 前に `dist/<deck>/` を削除または空にした evidence を記録し、clean/build 結果と生成 artifact を記録してください。

**判定基準:**
- requested deliverables に対応する `SLIDES.html` / `SLIDES.pdf` / `SLIDES.pptx` だけが `dist/<deck>/` に存在する場合は `passed` としてください。
- `dist/<deck>/` に stale artifact が混ざる場合、または requested artifact が作れない場合は `failed` としてください。

**禁止事項**
- visual/layout inspection を行わないでください。
- Resolved Design Contract、`sections/*`、`SLIDES.md`、HTML visual、`images/*` の visual polish を広げないでください。
- `brief.md` の自由記述から deliverable 種別を追加しないでください。

**report file format:**
- `review/deliver-work.md` は YAML front matter で開始し、`command: deliver`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: work`、`cycle`、`state: worked`、`result`、`source_artifact_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Delivery Build
- Result: passed / failed
- Cleaned directory:
- Requested deliverables:
- Generated artifacts:
- Blocking issues:
