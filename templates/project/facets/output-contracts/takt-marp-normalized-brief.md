# Normalized Brief Artifact

この report は `slides/<deck>/brief.normalized.md` として同期される source artifact です。

## 出力形式

- Markdown 本文だけを出力してください。
- YAML front matter、コードフェンス、説明用の前置き、後置きは付けないでください。
- `# Normalized Brief` から始めてください。

## 必須内容

- Goal
- Core Message
- Audience Context
- Required Topics
- Optional Topics
- Avoid
- Source Materials
- Speaker Notes
- Output Requirements
- Non-blocking Notes
- Event Context(節は必須。項目ラベルは `Name` / `Date` / `Duration`(分)/ `Venue` の 4 つとし、値が無い項目は「未指定」と記載)
- Speaker Profile(節は必須。名前・肩書・関連実績の箇条書き。情報が無い場合は「未指定」と記載)
- Fact Inventory(節は必須。version・数値実績・出典等の根拠付き事実の箇条書き。情報が無い場合は「未指定」と記載)

## 制約

- `brief.md` の意図を変更しないでください。
- Source Materials のうち読めなかったものは、成功扱いの根拠にせず Non-blocking Notes または Blocking Issues に分けてください。
- 後続 step がこの file だけを読んでも plan を作れる粒度で整理してください。
