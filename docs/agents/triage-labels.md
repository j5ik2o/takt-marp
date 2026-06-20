# Triage labels

mattpocock/skills は 5 つの標準 triage role を使う。このファイルでは、その role をこの repo の issue tracker の label 文字列へ対応付ける。

| mattpocock/skills の role | この repo の label | 意味 |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | maintainer が評価する必要がある |
| `needs-info` | `needs-info` | reporter からの追加情報待ち |
| `ready-for-agent` | `ready-for-agent` | agent が人間の追加文脈なしで着手できる |
| `ready-for-human` | `ready-for-human` | 人間による実装が必要 |
| `wontfix` | `wontfix` | 対応しない |

skill が triage role に言及した場合は、この表の label 文字列を使う。

既存の GitHub labels では `wontfix` は作成済み。他の label が未作成の場合は、必要になった時点でこの表の文字列どおりに作成する。
