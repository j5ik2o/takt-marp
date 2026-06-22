# DDD Content Acceptance Slice

このfixtureは、DDD講義らしい内容密度とPDF生成結果を短時間で確認するための precomputed content acceptance slice である。

`_workflow-smoke` は workflow/state/template/Design Contract wiring を検証するための合成fixtureであり、人間向け講義品質の確認対象ではない。このfixtureはその責務を分け、代表sliceだけで次を検証する。

- 固定アウトラインの一部がスライド内容へ反映されていること
- 共通題材「備品購入申請・承認」が章をまたいで一貫していること
- 図解、Java風Before/Afterコード、演習、appendix断片が含まれること
- Claude Design Source 由来の token を `SLIDES.md` front matter CSS へ反映していること
- 9枚のbounded sliceとして、`build:html` / `build:pdf` がどの `SLIDES.md` から生成されたか summary で追跡できること

## 実行手順

```bash
npm run slide:content-acceptance
```

実行時は `slides/_content-acceptance-ddd-slice/` にfixtureをコピーし、`dist/_content-acceptance-ddd-slice/SLIDES.html` と `dist/_content-acceptance-ddd-slice/SLIDES.pdf` を生成する。

このacceptanceは full 100〜140枚講義を生成しない。real provider も使わない。通常のローカル確認とCIで10分以内に終わる deterministic validation として扱う。
