# Domain docs

engineering skills がこの repo の domain documentation を読むための規約。

## 探索前に読むもの

- root `CONTEXT.md`: 存在する場合は、関連する用語・制約・invariant を確認する。
- `docs/adr/`: 作業対象に関係する ADR を確認する。

これらのファイルが存在しない場合は、その不在だけを理由に作成を提案しない。用語や設計判断を確定する必要が出たときに、`/domain-modeling` や `/grill-with-docs` 経由で追加する。

## layout

この repo は single-context として扱う。

- root `CONTEXT.md`: repo 全体の domain vocabulary と invariant
- `docs/adr/`: architecture decision record

root `CONTEXT-MAP.md` が追加された場合は、multi-context repo として関連 context の `CONTEXT.md` を読む。

## 語彙

issue title、設計メモ、仮説、test 名、PR 説明で domain concept を書く場合は、`CONTEXT.md` に定義された語彙を使う。

必要な概念が `CONTEXT.md` にない場合は、勝手に追加せず、domain modeling の gap として扱う。

## ADR との矛盾

出力や実装方針が既存 ADR と矛盾する場合は、黙って上書きせず、どの ADR と矛盾するのかを明示する。
