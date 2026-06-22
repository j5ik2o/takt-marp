# DDD Content Acceptance Slice Brief

## Purpose

DDD講義の full deck を毎回生成せず、代表sliceで内容密度、題材一貫性、Design Contract反映、PDF生成結果を確認する。

## Scope

- Target slide count: 9
- Duration budget: 10 minutes以内の deterministic local validation
- Provider: real provider は使わない
- Source mode: precomputed `SLIDES.md`
- Deliverables: html, pdf

## Fixed Outline Slice

1. DDDの目的を業務変更への耐性として説明する
2. 共通題材「備品購入申請・承認」で境界を揃える
3. Value Object、Entity、Aggregate、Domain Event の役割を比較する
4. Java風Before/Afterコードで業務の意味がコード構造へ表れることを示す
5. 短時間演習と模範回答で理解を確認する
6. Appendix断片として用語集と実践チェックリストを残す

## Required Content Markers

- Domain-Driven Design / ドメイン駆動設計
- 備品購入申請・承認
- Value Object
- Aggregate
- Domain Event
- Java Before / After
- 演習
- 模範回答
- Appendix
- Design Contract token usage

## Acceptance Notes

このfixtureは講義品質の代表sliceであり、workflow wiring smoke ではない。`slides/_workflow-smoke` のPDFが薄くても、このcontent acceptanceの結果とは別に扱う。
