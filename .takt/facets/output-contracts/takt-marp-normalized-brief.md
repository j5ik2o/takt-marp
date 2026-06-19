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
- Critical Constraints
  - Official Title(表紙タイトルとして完全一致させる文字列)
  - Speaker Name
  - Speaker Affiliation
  - Fixed Outline(章・節・leaf項目を元の順序と表記で保持)
- Required Topics
  - Fixed Outline の全 leaf 項目を、Required Topics にも漏れなく保持する
- Optional Topics
- Avoid
  - 禁止語と避けるべき表現を、原文の意図が分かる粒度で保持する
- Source Materials
- Speaker Notes
- Output Requirements
  - Target slide count を原文値として保持する
  - Deck Mode を `overview` / `lecture-body` / `needs_correction` のいずれかで明記する
  - Target slide count と固定アウトライン・資料密度が矛盾する場合は、勝手に補正せず Non-blocking Notes に修正要求として残す
- Non-blocking Notes
- Event Context(節は必須。項目ラベルは `Name` / `Date` / `Duration` / `Venue` の 4 つとし、値が無い項目は「未指定」と記載。`Duration` は分単位の数値のみを記載し、数値へ換算できない場合は「未指定」とする)
- Speaker Profile(節は必須。名前・肩書・関連実績の箇条書き。情報が無い場合は「未指定」と記載)
- Fact Inventory(節は必須。version・数値実績・出典等の根拠付き事実の箇条書き。セミナー日時、主催、形式、対象、講師所属は brief にあれば必ず保持する。情報が無い場合は「未指定」と記載)
- Design Requirements(白基調/カラー利用/情報密度/印刷配布前提/文字サイズ/図表方針)
- Terminology Policy
- Example Policy
- Code Example Policy
- Exercise Policy
- Appendix Requirements
- Quality Checklist

## 制約

- `brief.md` の意図を変更しないでください。
- Source Materials のうち読めなかったものは、成功扱いの根拠にせず Non-blocking Notes または Blocking Issues に分けてください。
- 後続 step がこの file だけを読んでも plan を作れる粒度で整理してください。
- 固定アウトライン、正式タイトル、講師名、所属、禁止語、デザイン方針、情報密度、用語方針、具体例方針、コード例方針、演習方針、品質チェックを要約で消さないでください。長い場合は折りたたまず、章立てして保持してください。
