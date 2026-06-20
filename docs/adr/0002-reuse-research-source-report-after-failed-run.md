# 失敗した research run の調査元レポートを再利用する

`takt-marp research` は deep research 完了後に adapter や supervision で失敗することがあり、その再実行で同じ web 調査を最初から繰り返すのは無駄が大きい。安全条件を満たす場合だけ built-in `research-report.md` を Research Source Report Reuse（調査元レポート再利用）として再利用し、TAKT runtime の resume 機能ではなく Research Reuse Workflow（調査再利用ワークフロー）で後続 step だけを再実行する。

再利用可否は `.takt/research-reuse/*.json` の Research Reuse Sidecar（調査再利用サイドカー）で判定する。Research Reuse Sidecar には user-facing target、`research-brief.md` の `research_brief_sha256`、source run、source report path を保存し、現在の brief hash と一致しない場合は再利用しない。`--force` は前回成果物を信用せず作り直す操作として扱い、Research Reuse Sidecar が存在しても reuse せず full research を実行する。

この判断により、通常の失敗後再実行は無駄な deep research を避けられる。一方で、brief 変更、report 不在、複数候補、target 不一致などの曖昧なケースでは再利用せず、古い report を誤って使うリスクを避ける。
