# ブリーフ: slide-workflow-smoke-validation

## 課題

再設計後のworkflowには、target validation、approval gate、front matter schema、loop monitor routing、render evidence、final artifact verificationなど、横断的な契約が多い。scriptsとYAMLが個別には正しく見えても、全体sequenceではintegration gapで失敗しうる。

Smoke runなしでは、stale report、invalid target acceptance、missing approval check、render command drift、delivery artifact confusionが残る可能性がある。

## 現状

再設計docsではcanonical sequenceが定義されている。

```bash
npm run slide:plan -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" plan --by j5ik2o
npm run slide:compose -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" compose --by j5ik2o
npm run slide:polish -- "slides/<deck>"
npm run slide:deliver -- "slides/<deck>"
```

既存のsmoke fixtureは `fixtures/marp-slide-workflow/_workflow-smoke/` にあるが、新しいtarget contractでは `slides/<deck>/brief.md` ではなく `slides/<deck>` を渡す。

## 望ましい結果

再設計後のworkflowがsmoke deckで `delivered` に到達し、以下を証明する。

- commandは `slides/<deck>` だけを受け付ける
- approval missingの場合、次commandはTAKT起動前に止まる
- approval fileは明示的な人間コマンドでのみ生成される
- `plan` と `compose` は `result: passed` のsupervision reportを出す
- `polish` は `.takt/render/<deck>/` にrender evidenceを出す
- `deliver` は `plan.md` の `deliverables` に従って `dist/<deck>/` にofficial artifactsを出す
- invalid targetとrerun/force behaviorが設計どおり動く
- rejected rerunとhistory archive behaviorが検証される

## アプローチ

foundation scriptsとorchestration workflowsが揃った後、smoke deckに対してcanonical sequenceを実行する。Smoke executionはintegration specとして扱い、scripts、workflow routing、output contracts、facet instructions、report front matter、render evidence behaviorを収束するまで修正する。

このspecは新しいworkflow semanticsを導入しない。Smoke executionで既存specと矛盾する問題が見つかった場合だけ、上流docs/specを明示的に更新する。

## スコープ

- **対象**:
  - `slides/<deck>` targetのsmoke deck準備
  - full command sequence実行
  - plan approvalとcompose approval behavior検証
  - render evidence出力検証
  - delivery artifacts検証
  - invalid target rejection検証
  - missing approval preflight failure検証
  - successful rerun requires `--force` の検証
  - rejected rerun does not require `--force` の検証
  - force invalidation archives reports and cleans generated outputsの検証
  - smokeで見つかったintegration issuesの修正
- **対象外**:
  - command/state model再設計
  - compatibility aliases追加
  - approval ownership変更
  - `html`、`pdf`、`pptx` 以外のdeliverable追加
  - PPTX visual inspectionの `polish` 組み込み

## 境界候補

- smoke fixture preparation
- end-to-end command sequence validation
- preflight failure validation
- rerun and force behavior validation
- render evidence validation
- delivery artifact validation
- integration fix loop

## 明示的な対象外

- smoke criteriaに関係しない広範なvisual design改善
- canonical sequenceに不要な新機能
- GitHub PR automation
- human approval policy変更

## 上流 / 下流

- **上流**:
  - `slide-workflow-foundation`
  - `slide-workflow-orchestration`
  - `fixtures/marp-slide-workflow/_workflow-smoke/`
- **下流**:
  - redesign後workflowを使った実deck生成
  - real run logsに基づくTAKT workflow最適化

## 既存specとの接点

- **Extends**: `slide-workflow-foundation`, `slide-workflow-orchestration`
- **Adjacent**: none

## 制約

- smoke targetは `slides/<deck>` にする。
- `slides/<deck>/brief.md` はcommand targetとして拒否する。
- `slide:approve` は明示実行のみ許可し、`--by` を必須にする。
- `pdftoppm` がない場合、`polish` はdegraded modeでよいが、HTML PNG evidence failureはblockerにする。
- `deliver` はexport前に `dist/<deck>/` をcleanする。
- smoke修正で旧top-level commandsを再導入しない。
