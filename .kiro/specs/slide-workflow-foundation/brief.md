# ブリーフ: slide-workflow-foundation

## 課題

Marp slide workflowのユーザー操作とTAKT内部ループの責務が混ざっている。`draft`、`review-revise`、`build-qa` のようなコマンド名は、成果物状態、作業行為、品質保証概念を同じ階層に置いており、次のworkflowが何を前提にしてよいかが曖昧である。

また、approvalや状態判定がreport本文やファイル存在に依存すると、古いreport、失敗report、人間承認待ちを誤って成功扱いする危険がある。

## 現状

現状の `package.json` には `slide:plan`、`slide:draft`、`slide:review-revise`、`slide:build-qa` がある。TAKT workflowも `takt-marp-slide-plan`、`takt-marp-slide-draft`、`takt-marp-slide-review-revise`、`takt-marp-slide-build-qa` という分割になっている。

`docs/marp-slide-workflow-redesign/` では、これを `plan / compose / polish / deliver` に再設計する方針が整理済みである。ただし、実行前状態検証、approval生成、report schema、force/rerun制御の決定論的な土台はまだない。

## 望ましい結果

以下が成立する状態にする。

- すべてのslide workflow commandは `slides/<deck>` をtargetにする
- `slides/<deck>/brief.md` 直指定は拒否される
- `plan / compose / polish / deliver` のnpm entrypointがwrapper script経由になる
- state checkはYAML front matterをparseして行う
- approval fileは `slide:approve` で生成できるが、対象は `plan` と `compose` だけにする
- TAKT workflow agentがapproval fileを作る余地を設計上なくす
- successful stateの再実行は `--force` がない限り拒否される
- rejected stateは `--force` なしで再実行できるが、既存reportはhistoryへarchiveされる
- `--force` はcommand以降のcanonical report/approvalをarchiveし、stale generated outputsをcleanする

## アプローチ

最初にworkflow YAMLを書き換えず、deterministic scriptとdocsを土台として作る。`scripts/lib/takt-marp-slide-workflow.mjs` にtarget解決、front matter parse、state/approval validation、archive/cleanup helperを集約し、`takt-marp-run-slide-workflow.mjs`、`takt-marp-check-slide-workflow-state.mjs`、`takt-marp-approve-slide-workflow-state.mjs` を薄く保つ。

Front matter parserは新規依存を追加せず、documented subsetだけを扱う。`takt-marp-run-slide-workflow.mjs` は `./node_modules/.bin/takt --pipeline --skip-git` を固定で呼び、preflight失敗時はTAKTを起動しない。

## スコープ

- **対象**:
  - ADR作成
  - workflow docs更新
  - report schema docs作成
  - `scripts/lib/takt-marp-slide-workflow.mjs`
  - `scripts/takt-marp-check-slide-workflow-state.mjs`
  - `scripts/takt-marp-approve-slide-workflow-state.mjs`
  - `scripts/takt-marp-run-slide-workflow.mjs`
  - `scripts/takt-marp-render-slide-workflow-evidence.mjs` の初期実装
  - `package.json` の `slide:*` scripts更新
- **対象外**:
  - TAKT workflow YAMLの全面再編
  - facet/output-contractの大規模整理
  - smoke deckの完全実行
  - 旧コマンド互換エイリアス
  - full YAML parser導入

## 境界候補

- command runner boundary: npm scriptからTAKT起動までのpreflightとforce/rerun制御
- state contract boundary: supervision/approval front matterの機械判定
- approval boundary: 人間承認記録をTAKT生成物から分離する
- render evidence boundary: `polish` が使う一時証跡を `dist/` から分離する

## 明示的な対象外

- `takt-marp-slide-compose`、`takt-marp-slide-polish`、`takt-marp-slide-deliver` の完成版workflow実装
- old workflow deletion
- built-in facet `extends` の全面適用
- actual slide visual repair loopの品質調整

## 上流 / 下流

- **上流**:
  - `docs/marp-slide-workflow-redesign/requirements.md`
  - `docs/marp-slide-workflow-redesign/design.md`
  - `docs/marp-slide-workflow-redesign/tasks.md`
  - existing `package.json`
  - existing `.takt/workflows/*`
- **下流**:
  - `slide-workflow-orchestration`
  - `slide-workflow-smoke-validation`
  - stable command/state semanticsに依存する今後のKiro specs

## 既存specとの接点

- **Extends**: none
- **Adjacent**: none

## 制約

- `--skip-git` は常に使う。
- `./node_modules/.bin/takt` を直接呼ぶ。
- `slide:approve` は `--by` を必須にする。
- `slide:approve` は `polish` と `deliver` を拒否する。
- approval fileはTAKT workflowで生成しない。
- preflight errorはactionableにし、TAKT起動前に止める。
- generated directoriesは削除してよいが、source artifactsは自動削除しない。
