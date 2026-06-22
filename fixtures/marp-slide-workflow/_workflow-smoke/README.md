# Workflow Smoke Deck

このfixtureは Marp slide TAKT workflow の実行確認用である。
通常の `npm run build` が `slides/` 配下のMarkdownをすべて変換するため、fixtureは `slides/` 外に置く。

このfixtureは workflow/state/template/Design Contract wiring の検証に限定する。人間向け講義品質やDDD講義の内容密度を確認するためのfixtureではない。DDD講義の代表slice品質は `fixtures/marp-slide-workflow/_content-acceptance-ddd-slice/` と `npm run slide:content-acceptance` で確認する。

## 実行手順

実行確認時は、fixture の source artifact を smoke deck directory にコピーして使う。
コマンド target は deck directory の `slides/<deck>` であり、`brief.md` file path ではない。

```bash
mkdir -p slides/_workflow-smoke
cp fixtures/marp-slide-workflow/_workflow-smoke/brief.md slides/_workflow-smoke/brief.md
npm run slide:plan -- "slides/_workflow-smoke"
npm run slide:approve -- "slides/_workflow-smoke" plan --by <name>
npm run slide:compose -- "slides/_workflow-smoke"
npm run slide:approve -- "slides/_workflow-smoke" compose --by <name>
npm run slide:polish -- "slides/_workflow-smoke"
npm run slide:deliver -- "slides/_workflow-smoke"
```

`slides/_workflow-smoke/brief.md` は fixture から再現する source artifact である。
workflow が生成する `slides/_workflow-smoke/review/` や `.takt/render/_workflow-smoke/` は generated evidence であり、`dist/_workflow-smoke/` は delivery artifact である。
`dist/_workflow-smoke/SLIDES.pdf` は smoke workflow が生成した `slides/_workflow-smoke/SLIDES.md` 由来のartifactであり、実プロバイダによるDDD講義成果物ではない。
