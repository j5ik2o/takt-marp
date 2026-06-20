# Issue tracker: GitHub

この repo の issue と PRD は GitHub Issues で管理する。issue 操作には `gh` CLI を使う。

## 対象 repo

- GitHub repo: `j5ik2o/takt-marp`
- Issues: GitHub Issues

## 操作規約

- issue を作成する: `gh issue create --title "..." --body "..."`
- issue を読む: `gh issue view <number> --comments`
- issue を一覧する: `gh issue list --state open --json number,title,body,labels,comments`
- issue にコメントする: `gh issue comment <number> --body "..."`
- label を追加する: `gh issue edit <number> --add-label "..."`
- label を外す: `gh issue edit <number> --remove-label "..."`
- issue を閉じる: `gh issue close <number> --comment "..."`

複数行の本文を書く場合は heredoc を使う。repo は clone 内で `gh` を実行すれば `git remote -v` から自動推定される。

## skill が issue tracker への publish を求めた場合

GitHub issue を作成する。

## skill が関連 ticket の取得を求めた場合

`gh issue view <number> --comments` を実行し、本文・コメント・label を確認する。
