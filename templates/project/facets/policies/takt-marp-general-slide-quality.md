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
- SVG の viewBox、図形内テキスト、Marp 配置制約
- TAKT worker の git 操作禁止、approval 生成禁止、オーケストレーション禁止

## 原則

| 原則 | 基準 |
|------|------|
| 1スライド1メッセージ | 複数主張が混在する場合は分割する |
| 本文は短く | 最大5 bullet、詳細はspeaker notesへ移す |
| 発表文脈を残す | 各スライドにspeaker notesを付ける |
| 根拠を追える | 事実主張はSource MaterialsまたはplanのSourceに結びつける |
| 人間承認を尊重 | plan後とcompose後の承認判断を前提にする |

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
