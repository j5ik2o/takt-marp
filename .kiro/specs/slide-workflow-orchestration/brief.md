# ブリーフ: slide-workflow-orchestration

## 課題

現行のTAKT workflowはMECEではない。`review-revise` は本来各command内部に閉じるべきreview/fixをトップレベルコマンドとして露出している。`build-qa` はrender/build、inspection、repair、delivery concernsを混ぜており、`QA` を1つの工程名のように扱っている。

このため、command境界が曖昧になり、中途半端な状態が通常の操作面へ漏れる。

## 現状

既存workflow files:

- `.takt/workflows/takt-marp-slide-plan.yaml`
- `.takt/workflows/takt-marp-slide-draft.yaml`
- `.takt/workflows/takt-marp-slide-review-revise.yaml`
- `.takt/workflows/takt-marp-slide-build-qa.yaml`

既存facetsにはMarp/slide固有の有用なものが揃っているが、新しいcommand/state modelに合わせた整理はまだできていない。local facetsもbuilt-in facetsを `extends` して再利用する形には十分寄っていない。

## 望ましい結果

canonical TAKT workflowは4つだけにする。

- `takt-marp-slide-plan`
- `takt-marp-slide-compose`
- `takt-marp-slide-polish`
- `takt-marp-slide-deliver`

旧workflowはaliasなしで削除する。

- `takt-marp-slide-draft`
- `takt-marp-slide-review-revise`
- `takt-marp-slide-build-qa`

各workflowは内部で品質ループを閉じる。

```text
work -> review/inspect/verify -> fix -> review/inspect/verify -> supervise
```

`review`、`fix`、`supervise` は内部step概念であり、ユーザー向けコマンドではない。Loop monitoring は TAKT `loop_monitors` で定義する。

## アプローチ

`slide-workflow-foundation` のscriptsとreport schemaを前提契約として使う。workflow YAMLを `plan / compose / polish / deliver` 中心に再構築し、各workflowは `slides/<deck>/review/` にcanonical reportsを出す。

汎用mechanicsはTAKT built-in facetsを `extends` して再利用し、Marp固有の制約だけをlocal thin-diff facetsに残す。supervisionとloop monitorには専用personaを追加する。

## スコープ

- **対象**:
  - `takt-marp-slide-plan` の再構築
  - `takt-marp-slide-compose` の作成
  - `takt-marp-slide-polish` の作成
  - `takt-marp-slide-deliver` の作成
  - 旧workflow filesの削除
  - report output contractsの統合
  - `takt-marp-general-slide-quality`、`takt-marp-slide-quality`、`takt-marp-svg-first-visual`、`takt-marp-worker-boundary` へのpolicy整理
  - `takt-marp-slide-supervisor` の追加と TAKT `loop_monitors` の設定
  - 可能なbuilt-in `extends` の適用
  - workflow step名のsnake_case統一
  - report名の `{command}-{role}.md` 統一
- **対象外**:
  - deterministic script foundation実装
  - smoke runと収束修正
  - workflow内git操作
  - 旧コマンド互換alias

## 境界候補

- plan workflow: `brief.normalized.md`、`plan.md`、`plan-supervision.md` を作る
- compose workflow: `design-system.md`、`SLIDES.md`、SVG、`compose-supervision.md` を作る
- polish workflow: render evidenceと `polish-supervision.md` を作り、visual/layout/render関連だけ修正する
- deliver workflow: `dist/<deck>/` に最終成果物を作り、`deliver-supervision.md` を作る
- facet layer: generic mechanicsはbuilt-in `extends`、Marp固有制約はlocal facets

## 明示的な対象外

- `slide:approve` 実装
- front matter parser実装
- artifact readability script details
- smoke実行で見つかる最終調整

## 上流 / 下流

- **上流**:
  - `slide-workflow-foundation`
  - TAKT built-in facet docs and available built-in facets
  - current `.takt/facets`
  - current `.takt/workflows`
- **下流**:
  - `slide-workflow-smoke-validation`
  - canonical report schemaとcommand/state modelに依存する今後のslide workflow改善

## 既存specとの接点

- **Extends**: `slide-workflow-foundation`
- **Adjacent**: none

## 制約

- old workflow filesは実行可能な形で残さない。
- `QA` はtop-level workflow名やnpm command名に使わない。
- `compose` はrender outputを要求しない。
- `polish` はplan-level contentを変更しない。
- `deliver` はvisual inspectionを行わない。
- `plan` と `compose` はapproval fileを作らない。
- `polish` と `deliver` は通常のapproval fileを要求しない。
- fix loopは必ず TAKT `loop_monitors` で監視する。
- supervisionはworkflow全体の完了契約を確認し、詳細reviewの再実施はしない。
