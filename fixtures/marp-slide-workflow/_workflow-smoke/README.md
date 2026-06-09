# Workflow Smoke Deck

このfixtureは Marp slide TAKT workflow の実行確認用である。
通常の `npm run build` が `slides/` 配下のMarkdownをすべて変換するため、fixtureは `slides/` 外に置く。

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
