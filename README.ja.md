# takt-marp

[English](README.md)

Marpスライドデッキと、半自動でデッキを生成するためのTAKT workflowを管理するリポジトリです。

## TAKT Marp workflow

このworkflowは `slides/<deck>/brief.md` を起点に、`plan`、`compose`、`polish`、`deliver` の状態へ進めます。

詳細なworkflow contract: [docs/marp-slide-workflow.md](docs/marp-slide-workflow.md)

### 1. briefを作成する

`slides/<deck>/brief.md` を作成します。コマンドに渡すtargetは `brief.md` ではなく、deck directory の `slides/<deck>` です。

最小構成:

- `Goal`
- `Core Message`
- `Audience Context`
- `Output Requirements`

Output Requirementsの例:

```md
## Output Requirements
- Format: Marp
- Language: Japanese
- Target slide count: 5
- Deliverables: html, pdf
```

### 2. workflowを実行する

```bash
npm run slide:plan -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" plan --by <name>
npm run slide:compose -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" compose --by <name>
npm run slide:polish -- "slides/<deck>"
npm run slide:deliver -- "slides/<deck>"
```

targetは `slides/<deck>` を指定します。

```bash
npm run slide:plan -- "slides/<deck>"
```

人間承認は `plan` と `compose` に対してのみ `slide:approve` で記録します。`review`、`revise`、`qa`、`build-qa` はworkflow内部の責務であり、トップレベルコマンドではありません。

### 3. 生成されるファイル

```text
slides/<deck>/
  brief.normalized.md
  plan.md
  design-system.md
  SLIDES.md
  images/*.svg
  review/*.md
```

`design-system.md` はデッキ単位のtypography、spacing、layout、visual、color、QA tokenを定義します。`SLIDES.md` はスライドごとの個別style調整ではなく、Marp class経由でそれらのtokenを使う前提です。

### 4. polishとdeliverの範囲

`polish` は見た目の検査と修正loopを担当します。

- SVG参照とXML妥当性
- スライド枠への収まり、文字の収まり、図の大きさ、ページ番号との干渉
- layout選択と段組比率
- typography consistency: 文字間、行間、サイズ階層
- spatial balance: 上寄り、左寄り、大きな意図しない余白、視覚重心
- design-system usage: token化されたCSS、スライドごとのstyle drift防止

`deliver` は要求された成果物を生成します。PDF生成は対象deckの `SLIDES.md` だけをbuildします。

```bash
npm run build:pdf -- <deck>
```

### 5. 検証

軽量なローカル確認には foundation validation を使います。

```bash
npm test
```

workflow routing、state gate、render evidence、delivery verification、approval handling を変更した場合は smoke validation を実行します。

```bash
npm run slide:smoke -- --keep
```

smoke validation は fixture から一時的な `_workflow-smoke` deck を作成し、invalid target、approval failure path、`plan` -> `compose` -> `polish` -> `deliver` の一連の実行、render evidence metadata、delivery artifact、rerun/force behavior を検証します。`--keep` を付けると、生成された deck と report を `slides/_workflow-smoke/` に残して確認できます。

### Smoke fixture

小さな入力fixtureがあります。

```text
fixtures/marp-slide-workflow/_workflow-smoke/
```

新しいbriefを作らずにworkflow全体を試したい場合は、`slides/` 配下へコピーして使います。
