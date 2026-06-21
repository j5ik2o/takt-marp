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

Kiro / SDD / OpenSpec の requirements / design / tasks / review を生成または更新した後は、次の phase、design validation、implementation、PR 化へ進む前に、spec 内のドメイン用語・契約名・境界名を `CONTEXT.md` と照合する。

- 未登録のプロジェクト固有用語は glossary gap として扱い、`/domain-modeling` または `/grill-with-docs` 経由で確定してから `CONTEXT.md` に登録する。
- 一般的な技術語、ファイル名、関数名、単発の実装詳細、一次的な作業ラベルは `CONTEXT.md` に登録しない。
- spec 側の表記ゆれは `CONTEXT.md` の canonical term に合わせて修正する。

## ADR との矛盾

出力や実装方針が既存 ADR と矛盾する場合は、黙って上書きせず、どの ADR と矛盾するのかを明示する。
