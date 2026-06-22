# takt-marp

[English](README.md)

Marpスライドデッキと、半自動でデッキを生成するためのTAKT workflowを管理するリポジトリです。

## TAKT Marp workflow

このworkflowは `slides/<deck>/brief.md` を起点に、`plan`、`compose`、`polish`、`deliver` の状態へ進めます。外部調査が必要な deck だけ、任意で先に `research` を実行します。

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
takt-marp research "slides/<deck>"
takt-marp plan "slides/<deck>"
takt-marp approve "slides/<deck>" plan --by <name>
takt-marp compose "slides/<deck>"
takt-marp approve "slides/<deck>" compose --by <name>
takt-marp polish "slides/<deck>"
takt-marp deliver "slides/<deck>"
```

targetは `slides/<deck>` を指定します。

```bash
takt-marp plan "slides/<deck>"
```

人間承認は `plan` と `compose` に対してのみ `takt-marp approve` で記録します。`review`、`revise`、`qa`、`build-qa` はworkflow内部の責務であり、トップレベルコマンドではありません。
`research` は `slides/<deck>/research/research-brief.md` を読み、`plan` の必須前提ではありません。

### 3. 生成されるファイル

```text
slides/<deck>/
  design/design-brief.md
  design/<claude-design-export>.zip
  brief.normalized.md
  plan.md
  slide-blueprint.md
  sections/*.md
  SLIDES.md
  images/*.svg
  research/*.md
  review/*.md
```

`design/design-brief.md` は Claude Design に渡す Design System 作成依頼です。`brief.md` / `brief.normalized.md` の資料要求、brand constraints、audience constraints、style constraints を primary input とし、通常 flow では生成済み `plan.md` / `slide-blueprint.md` を Claude Design 作成の primary input にしません。

`plan` と `compose` は `slides/<deck>/design/` 配下に Claude Design export zip が1つあることを前提にします。runner はこれを `.takt/design-contracts/<deck>/resolved-design-contract.json` へ正規化し、`plan` は metadata、fingerprint、`SKILL.md` / `readme.md` などの guidance、component/starting point/card/template/theme/font/sample catalog を記録します。template は manifest 記載分だけでなく、zip 内の `templates/**/*.dc.html` からも catalog 化します。`compose` は同じ token と catalog を `SLIDES.md`、section HTML/CSS、生成 visual source に適用します。Design System は deck ごとに異なるため、特定ドメインや特定 component 名を固定前提にしません。`design/design-brief.md` がある場合は、その fingerprint も記録して drift 検出に使います。ない場合でも進行できますが、Design Brief drift protection は unavailable として記録します。

### 4. polishとdeliverの範囲

`polish` は見た目の検査と修正loopを担当します。

- SVG参照とXML妥当性
- スライド枠への収まり、文字の収まり、図の大きさ、ページ番号との干渉
- layout選択と段組比率
- typography consistency: 文字間、行間、サイズ階層
- spatial balance: 上寄り、左寄り、大きな意図しない余白、視覚重心
- Design Contract usage: token化されたCSS、スライドごとのstyle drift防止

`deliver` は要求された成果物を生成し、delivery verification と supervision まで行います。
単純なローカル生成や確認だけなら、workflow state を変更しない utility command を使います。

```bash
takt-marp build:html <deck>
takt-marp build:pdf <deck>
takt-marp preview <deck>
```

### 5. 検証

workflow routing、state gate、render evidence、delivery verification、approval handling を変更した場合は smoke validation を実行します。

```bash
takt-marp smoke --keep
```

smoke validation は fixture から一時的な `_workflow-smoke` deck を作成し、invalid target、approval failure path、`plan` -> `compose` -> `polish` -> `deliver` の一連の実行、render evidence metadata、delivery artifact、rerun/force behavior を検証します。`--keep` を付けると、生成された deck と report を `slides/_workflow-smoke/` に残して確認できます。

### Smoke fixture

小さな入力fixtureがあります。

```text
fixtures/marp-slide-workflow/_workflow-smoke/
```

新しいbriefを作らずにworkflow全体を試したい場合は、`slides/` 配下へコピーして使います。
