# Brief

## Event
- Name: Workflow smoke test
- Date:
- Duration: 5 minutes
- Venue: local
- Audience: maintainer

## Goal
Marp slide TAKT workflow が brief から plan、draft、SVG、review、build QA まで接続できることを確認する。

## Core Message
半自動のMarp生成workflowは、入力、構成、visual、レビュー、QAを分離すると安定する。

## Audience Context
聴衆はこのリポジトリのメンテナであり、TAKTとMarpの基本を理解している。

## Required Topics
- briefを入力の正にする
- SVG-firstで図を管理する
- plan後とdraft後に人間確認を挟む
- build QAまでworkflowに含める

## Optional Topics
- appendixは必要な場合だけ作る

## Avoid
- Web画像の自動取得
- 他deck画像の自動流用
- 長い本文をスライドに詰め込むこと

## Source Materials
- docs/marp-slide-workflow.md

## Speaker Notes
短い確認用deckなので、各スライドのnotesは2-3文でよい。

## Output Requirements
- Format: Marp
- Language: Japanese
- Target slide count: 5
- Deliverables: html, pdf
- Visual scope: use exactly one SVG for the workflow overview slide. For paired discipline slides, use text-only split columns with Visual: none; do not plan unused SVG placeholders.
