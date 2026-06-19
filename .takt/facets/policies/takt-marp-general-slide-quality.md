{extends:qa}

# スライド品質ポリシー

スライド一般の品質基準、finding severity、完了判定の基準を守る。

## 責務の境界

**このポリシーが扱うこと:**
- 発表目的、聴衆、中心メッセージに対する品質
- 1スライド1メッセージ、情報密度、話しやすさ
- finding severity と blocker/non-blocking の切り分け
- review/fix/supervision での完了判定の基準

**このポリシーが扱わないこと:**
- Marp Markdown、front matter、deck local artifact の具体制約
- HTML/CSS visual とSVGの使い分け、SVG viewBox、図形内テキスト、Marp 配置制約
- TAKT worker の git 操作禁止、approval 生成禁止、オーケストレーション禁止

## 原則

| 原則 | 基準 |
|------|------|
| 1スライド1メッセージ | 複数主張が混在する場合は分割する |
| 本文は短く | 最大5 bullet、詳細はspeaker notesへ移す |
| 発表文脈を残す | 各スライドにspeaker notesを付ける |
| 根拠を追える | 事実主張はSource MaterialsまたはplanのSourceに結びつける |
| 人間承認を尊重 | plan後とcompose後の承認判断を前提にする |

## Speaker Notes 尺契約

各スライドの speaker notes(HTML コメント)には以下の基準を適用する。

**canonical 尺マーカー形式:**

```
【N分 / 累計 M:SS】
```

- speaker notes の冒頭行に置く
- `N`: 当該スライドの所要時間(正の数、0.5 刻みを許容)
- `M:SS`: 当該スライド終了時点の累計時間(分:秒)

**整合規則:**

- 最終スライドの累計は `brief.normalized.md` の `Event Context` の発表時間(`Duration`。質疑時間を除く本編時間)と一致しなければならない
- 累計に差異がある場合は、該当スライドの notes に理由を記す

**強調点:**

- 各スライドの notes に「聴衆に最も伝えるべき 1 点」を含めること

**未確定時の禁止:**

- `brief.normalized.md` の `Event Context` に発表時間(`Duration`)が存在しない(「未指定」)場合、尺マーカーを記載してはならない
- 推測した時間を記載することは捏造として扱い、禁止する

## 先鋭度・密度基準

### 先鋭度基準

タイトルまたはリード文の汎用性を以下の手順で判定する。

- タイトル・リード文から、deck 名・固有名詞・数値・本 deck の主張を除去する
- 除去後の表現が他の deck でもそのまま成立する場合、汎用表現と判定する

汎用表現は先鋭度 finding の対象とする。好みによる指摘は finding にしない。

### 密度基準

bullet の列挙形式が情報伝達に適切かを以下の基準で判定する。

- 対比・手順・属性比較の並列構造が bullet で列挙されており、表・カード・コード例に置換することで伝達効率が上がると判断できる場合、置換可能と判定する

置換可能な bullet 列挙は密度 finding の対象とする。好みによる指摘は finding にしない。

## Finding Severity

| Severity | 判定基準 |
|----------|----------|
| blocker | command の成果物境界、必須 artifact、根拠、schema を満たせない |
| major | 発表目的、中心メッセージ、聴衆理解、可読性に明確な悪影響がある |
| minor | 発表品質は落ちるが、後続 command または人間判断で扱える |
| info | 任意改善、判断メモ、非ブロッキングの確認事項 |

## 完了判定

- blocker finding が残る場合は supervision 成功へ進めない。
- major finding を waiver する場合は、waived reason と human decision item を残す。
- minor/info finding は command の目的に照らして、後続 command で扱うか明示する。
- 好みだけの指摘は finding にしない。
