# 要件定義書: slide-workflow-research

## はじめに

Marp slide workflow に、既存の `plan / compose / polish / deliver` とは独立した任意の `research` workflow を追加する。`research` は TAKT built-in の deep research 能力を deck-local artifact として取り込み、後続の `plan` が必要に応じて参照できるようにする。

## 境界コンテキスト（任意）
- **対象範囲**: `research` command、deck-local research input/output、research 成否の機械的判定、Research Source Report Reuse（調査元レポート再利用）、任意の plan input、bundled/ejected template 配布、validation/smoke coverage。
- **対象外**: PPTX/PDF export 自体、Marp rendering 品質改善、`plan / compose / polish / deliver` の基本状態モデル再設計、外部 deep research 機能の repo-local fork、TAKT runtime の resume 機能の所有。
- **隣接システム／スペックへの期待**: 既存 slide workflow は `slides/<deck>` target contract、front matter ベースの状態判定、human approval ownership、package-bundled template 方針を維持する。

## 要件

### 要件 1: 任意の research コマンド

**目的:** deck 作成者として、調査が必要な deck だけで事前 research を実行するために、既存 slide workflow とは独立した `research` command が欲しい。

#### 受け入れ基準

1.1. deck 作成者による `takt-marp research slides/<deck>` の実行が起きたとき、システムは `slides/<deck>` を既存 target contract と同じ規則で検証しなければならない。
1.2. `research` workflow が利用不能の場合、システムは TAKT 実行を開始せずに明示的なエラーを返さなければならない。
1.3. deck 作成者による `plan` の実行が起きたとき、システムは `research` の成功状態を必須前提にしないようにしなければならない。
1.4. deck 作成者による `compose`、`polish`、`deliver` の実行が起きたとき、システムは既存の承認・状態前提を維持しなければならない。
1.5. CLI help 表示が起きたとき、システムは `research` が任意の事前調査 command であることを既存 workflow command と区別して表示しなければならない。

### 要件 2: deck-local research 入力

**目的:** deck 作成者として、調査依頼と制作 brief を分けて管理するために、research 専用の deck-local input が欲しい。

#### 受け入れ基準

2.1. `research` の実行が起きたとき、システムは `slides/<deck>/research/research-brief.md` を主入力として扱わなければならない。
2.2. `research-brief.md` が存在しない場合、システムは `brief.md` から暗黙に調査依頼を推測せず、明示的な不足エラーを返さなければならない。
2.3. `research-brief.md` が存在する場合、システムは deck root の `brief.md` の上書きを防止しなければならない。
2.4. deck 作成者による既存 `plan` の実行が起きたとき、システムは `research-brief.md` の有無だけで `plan` を失敗させないようにしなければならない。

### 要件 3: 調査成果物と根拠追跡

**目的:** deck 作成者として、スライド化前に調査結果と根拠を確認するために、出典と未解決事項を追跡できる research artifacts が欲しい。

#### 受け入れ基準

3.1. `research` の successful state 到達が起きたとき、システムは `slides/<deck>/research/research-report.md` を生成または更新しなければならない。
3.2. `research` の successful state 到達が起きたとき、システムは参照元一覧を `slides/<deck>/research/research-sources.md` として生成または更新しなければならない。
3.3. `research` の successful state 到達が起きたとき、システムは slide 化可能な主要主張を `slides/<deck>/research/research-claims.md` として生成または更新しなければならない。
3.4. 調査中に未解決事項が残る場合、システムは `slides/<deck>/research/open-questions.md` に未解決事項を記録しなければならない。
3.5. 調査成果物が生成された場合、システムは出典 URL、取得日、推測と確認済み事実の区別を記録しなければならない。

### 要件 4: research supervision と再実行

**目的:** workflow メンテナとして、research の成否と再実行を機械的に扱うために、既存 command と同等の supervision と rerun behavior が欲しい。

#### 受け入れ基準

4.1. `research` の完了が起きたとき、システムは `slides/<deck>/research/research-supervision.md` を生成または更新しなければならない。
4.2. `research-supervision.md` が `passed` の場合、システムは `state: researched` を要求しなければならない。
4.3. deck 作成者による成功済み `research` の再実行が起きたとき、システムは `--force` なしでは再実行を拒否しなければならない。
4.4. deck 作成者による `research --force` の実行が起きたとき、システムは既存 research reports を `slides/<deck>/research/history/` に退避しなければならない。
4.5. `research --force` の実行が起きたとき、システムは `plan / compose / polish / deliver` の review/approval artifacts の自動退避を防止しなければならない。
4.6. `research` が rejected で終了した場合、システムは同一 command の rejected artifact を退避して再実行できる状態にしなければならない。

### 要件 5: plan への任意入力

**目的:** deck 作成者として、調査結果がある deck だけで plan が追加文脈を参照するために、research artifact を任意入力として扱ってほしい。

#### 受け入れ基準

5.1. `plan` の実行が起きたとき、システムは `brief.md` を primary input として扱い続けなければならない。
5.2. `research-report.md` が存在する場合、システムは plan workflow が research artifact を任意の追加文脈として参照できる状態にしなければならない。
5.3. `research-report.md` が存在しない場合、システムは research 不在を理由に plan workflow を失敗させないようにしなければならない。
5.4. plan workflow が research artifact を参照した場合、システムは生成される `reference-analysis.md` または `plan.md` に research 由来の根拠を識別できる形で記録しなければならない。
5.5. research artifact が未解決事項を含む場合、システムは未解決事項を slide 計画上の前提または保留として扱い、捏造で補完しないようにしなければならない。

### 要件 6: 外部調査の境界

**目的:** workflow メンテナとして、外部 web 調査の許可を research に閉じるために、通常の slide 生成 workflow が暗黙に外部取得へ広がらないことを保証したい。

#### 受け入れ基準

6.1. `research` の実行が起きたとき、システムは deep research workflow の web 調査許可を research command 内に限定しなければならない。
6.2. `plan / compose / polish / deliver` の実行が起きたとき、システムは外部 web 取得を成功条件にしないようにしなければならない。
6.3. `research` workflow が外部ソースを使う場合、システムは参照元と取得時点を成果物に残さなければならない。
6.4. 外部調査が失敗した場合、システムは失敗を research command の結果として扱い、既存 successful plan state を破壊しないようにしなければならない。
6.5. `research` の実行が起きたとき、システムは TAKT built-in deep research 能力を利用し、同等機能の repo-local fork を防止しなければならない。

### 要件 7: 配布と検証

**目的:** workflow メンテナとして、research workflow を global CLI と ejected template の両方で利用するために、配布と検証の対象へ research を含めたい。

#### 受け入れ基準

7.1. package-bundled template が選択された場合、システムは `research` workflow template を bundled path から解決しなければならない。
7.2. project-local ejected template が選択された場合、システムは `research` workflow template を `.takt/workflows/` から解決しなければならない。
7.3. `takt-marp eject` の実行が起きたとき、システムは research workflow template と関連 facet を project-local にコピーしなければならない。
7.4. validation の実行が起きたとき、システムは `research` command の state/report/rerun 境界を検証しなければならない。
7.5. smoke validation の実行が起きたとき、システムは research 追加後も既存 `plan / compose / polish / deliver` の成功経路が維持されることを検証しなければならない。
7.6. template 同期検証の実行が起きたとき、システムは package templates と repo-local `.takt` assets の drift を検出しなければならない。

### 要件 8: Research Source Report Reuse（調査元レポート再利用）

**目的:** deck 作成者として、deep research 完了後の後続処理だけが失敗した場合に同じ外部調査を繰り返さないために、Research Source Report Reuse で既存の調査元レポートから research を再開してほしい。

#### 受け入れ基準

8.1. deep research が調査元レポートを生成した後に `research` が失敗し、同じ deck に対する `research` の再実行が起きたとき、システムは同じ外部調査を最初から繰り返さず、Research Source Report Reuse で既存の調査元レポートから後続の research artifacts と supervision を生成しなければならない。
8.2. 再利用候補の調査元レポートが存在しない場合、システムは Research Source Report Reuse を行わず、通常の `research` 実行として扱わなければならない。
8.3. 再利用候補の調査元レポートが複数存在する場合、システムは候補を推測で選ばず、明示的なエラーを返さなければならない。
8.4. 再利用候補が現在の deck と一致しない場合、システムは調査元レポートを再利用してはならない。
8.5. 現在の `research-brief.md` が再利用候補作成時の内容と一致しない場合、システムは調査元レポートを再利用してはならない。
8.6. `--force` を伴う `research` の実行が起きたとき、システムは Research Source Report Reuse を行わず、新しい `research` 実行として扱わなければならない。
8.7. Research Source Report Reuse で `research` が successful state に到達したとき、システムは通常の `research` 成功時と同じ deck-local research artifacts と `research-supervision.md` を生成または更新しなければならない。
8.8. Research Source Report Reuse 中に後続処理が失敗した場合、システムは再利用可能な調査元レポートを破棄せず、次回再実行できる状態を維持しなければならない。
