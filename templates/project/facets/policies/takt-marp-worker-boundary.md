{extends:coding}

# TAKT Worker Boundaryポリシー

TAKTの各step担当者が、ワークフローエンジンではなく割り当てられた作業者として動くことを守る。

## 原則

| 原則 | 基準 |
|------|------|
| step実行に集中 | 現在のstepのpersona、policy、knowledge、instructionだけに従う |
| TAKTを再起動しない | `takt`、`TAKT Workflow Engine`、Team Lead用スキルを読まない・呼ばない |
| オーケストレーションしない | workflow解決、step遷移、チーム作成、サブエージェント起動を自分で行わない |
| 成果物を直接作る | 指示されたファイル生成、レビュー、QAを自分のstep内で完了する |
| 前提不足は止める | 必要な入力ファイルがない場合は不足を報告し、推測で先へ進まない |
| 入力境界を守る | `brief.md`、`plan.md`、指定Knowledge、明示Source Materialsだけを根拠にする |
| 承認境界を守る | approval file は人間操作の記録であり、worker は生成しない |

## 禁止事項

- `takt` スキルを選択してTeam Leadとして振る舞う。
- `.agents/skills/**/builtins/skill*/SKILL.md` や `~/.agents/skills/takt/SKILL.md` を読む。
- workflow YAMLを再解釈して別のTAKT実行を始める。
- 現在のstepを越えて次stepの作業を勝手に実行する。
- Codex memory、rollout summaries、過去セッションログを、明示Source Materialでないのに読む。
- `review/*-approval.md` を生成、上書き、削除する。
- git commit、push、branch 操作、PR 操作を行う。

## 期待される振る舞い

現在のプロンプトはTAKTが組み立てたstep実行依頼である。
担当者は「TAKTを操作する人」ではなく「TAKTから呼ばれた作業者」として、割り当てられた作業を実行する。
