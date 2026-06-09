# 要件ドキュメント

## 概要

`takt-marp-global-installer` は、Marp slide workflow を repo-local な `npm run slide:*` 知識に依存せず、`npm install -g takt-marp` 後の `takt-marp` コマンドから利用できるようにする機能です。

利用者は対象プロジェクトで `takt-marp init .` を実行して `.takt/workflows/` と `.takt/facets/` を導入し、その後 `takt-marp plan / compose / polish / deliver` と `takt-marp smoke` を実行できます。対象プロジェクトには `package.json`、`node_modules`、local `takt-marp` install を要求せず、provider 設定や API key などのユーザ環境固有設定も生成しません。

## 境界コンテキスト

- **対象範囲**: global `takt-marp` コマンド、`init` による `.takt/workflows/**` と `.takt/facets/**` の生成、workflow command 入口、mock を既定にした smoke 入口、global install 検証、template drift 検証。
- **対象外**: `plan / compose / polish / deliver` の command/state/report/approval contract 再設計、TAKT workflow YAML や facets の責務変更、provider 設定ファイルや認証情報の生成、npm registry publish automation、Homebrew/mise/standalone binary 配布、global CLI の `slide:*` alias。
- **隣接期待**: `slide-workflow-foundation`、`slide-workflow-orchestration`、`slide-workflow-smoke-validation` が既存 workflow の target、状態、approval、report、mock/real smoke の契約を提供する。この feature はそれらの意味論を再定義せず、global install 後の利用入口と導入境界を提供する。

## 要件

### 1. グローバルコマンドを導入できる

**目的:** workflow 利用者として、repo を clone せずに `takt-marp` コマンドを導入したい。そうすることで、別プロジェクトでも同じ slide workflow 入口を利用できる。

#### 受け入れ条件

1.1. 対応 Node.js runtime の環境で利用者が package を global install した場合、takt-marp グローバルインストーラは `takt-marp` コマンドを PATH から実行できる状態にしなければならない。

1.2. 利用者が `takt-marp --help` または help 相当の操作を実行したとき、takt-marp グローバルインストーラは `init`、`plan`、`compose`、`polish`、`deliver`、`smoke` を利用可能な command として表示しなければならない。

1.3. 利用者が global CLI で `slide:*` 形式の command を指定した場合、takt-marp グローバルインストーラはその command を global CLI の有効 command として扱ってはならない。

1.4. 利用者が未対応の Node.js runtime で global CLI を利用しようとした場合、takt-marp グローバルインストーラは必要な Node.js version が分かる失敗情報を表示しなければならない。

### 2. 対象プロジェクトを明示的に初期化できる

**目的:** workflow 利用者として、対象プロジェクトに必要な workflow と facet だけを導入したい。そうすることで、runtime state や provider 設定を誤って持ち込まずに slide workflow を開始できる。

#### 受け入れ条件

2.1. 利用者が対象プロジェクトで `takt-marp init .` を実行したとき、takt-marp グローバルインストーラは `.takt/workflows/**` と `.takt/facets/**` を生成しなければならない。

2.2. 利用者が `takt-marp init <dir>` を実行したとき、takt-marp グローバルインストーラは指定された directory を初期化対象として扱わなければならない。

2.3. `init` が成功した場合、takt-marp グローバルインストーラは `.takt/config.yaml`、`.takt/runs/**`、`.takt/render/**`、session state、current target marker を生成してはならない。

2.4. `init` が成功した場合、takt-marp グローバルインストーラは provider 設定ファイル、API key、認証情報、ユーザ環境固有の TAKT 設定を生成または変更してはならない。

2.5. 初期化対象に既存の `.takt/` 配下データがある場合、takt-marp グローバルインストーラは template 対象外のファイルを削除または変更してはならない。

### 3. 初期化時の衝突を安全に扱う

**目的:** workflow 利用者として、既存 workflow/facet を暗黙に上書きされたくない。そうすることで、既存プロジェクトへの導入時に変更範囲を確認できる。

#### 受け入れ条件

3.1. `init` のコピー先に既存の template 対象ファイルがある場合、takt-marp グローバルインストーラは既定では失敗し、衝突した path の一覧を表示しなければならない。

3.2. `init` が衝突により失敗する場合、takt-marp グローバルインストーラは template ファイルを部分的に生成または上書きしてはならない。

3.3. 利用者が `--force` または `--overwrite` を指定して `init` を実行した場合、takt-marp グローバルインストーラは template 対象ファイルの上書きを許可しなければならない。

3.4. 利用者が `--force` または `--overwrite` を指定して `init` を実行した場合でも、takt-marp グローバルインストーラは template 対象外の runtime state、provider 設定、認証情報を上書きしてはならない。

3.5. 既存 template 対象ファイルがある場合、takt-marp グローバルインストーラは自動 merge、暗黙上書き、部分的な best-effort 更新を行ってはならない。

### 4. 対象プロジェクトの npm project 化なしで workflow command を実行できる

**目的:** workflow 利用者として、対象プロジェクトに local npm setup を追加せずに slide workflow を実行したい。そうすることで、任意の slide project に global CLI を導入しやすくなる。

#### 受け入れ条件

4.1. 利用者が `takt-marp plan`、`takt-marp compose`、`takt-marp polish`、または `takt-marp deliver` を実行したとき、takt-marp グローバルインストーラは実行時の current working directory を対象プロジェクトとして扱わなければならない。

4.2. workflow command 実行時に対象プロジェクトへ `.takt/workflows/**` または `.takt/facets/**` が導入されていない場合、takt-marp グローバルインストーラは未初期化であることと `takt-marp init .` の実行が必要であることを表示しなければならない。

4.3. 対象プロジェクトに `package.json`、`node_modules`、local `takt-marp` install が存在しない場合でも、takt-marp グローバルインストーラはそれらが存在しないことだけを理由に workflow command を失敗させてはならない。

4.4. 利用者が対象プロジェクト配下の subdirectory から workflow command を実行した場合、takt-marp グローバルインストーラは親 directory を暗黙探索して project root として扱ってはならない。

4.5. repo-local `npm run slide:*` 入口が存在する場合でも、takt-marp グローバルインストーラは global CLI の workflow command を target project の `npm run` 経由で実行してはならない。

### 5. 既存 slide workflow 契約を global CLI から利用できる

**目的:** workflow 利用者として、global CLI からも既存の `plan / compose / polish / deliver` の進行条件を保ったまま実行したい。そうすることで、repo-local 実行と global 実行で workflow の意味が変わらない。

#### 受け入れ条件

5.1. 利用者が global CLI から `plan / compose / polish / deliver` を実行したとき、takt-marp グローバルインストーラは既存 slide workflow の target contract、prerequisite、approval gate、report freshness の判定結果を尊重しなければならない。

5.2. 利用者が無効な target を指定した場合、takt-marp グローバルインストーラは TAKT workflow を開始する前に既存 slide workflow と同等の target error を表示しなければならない。

5.3. workflow command が既存の成功状態に到達済みの場合、takt-marp グローバルインストーラは既存 slide workflow と同等の rerun blocking または force invalidation の扱いを提供しなければならない。

5.4. 利用者が global CLI の workflow command で provider を明示した場合、takt-marp グローバルインストーラは指定された provider で workflow 実行を試行しなければならない。

5.5. この機能の要件を満たす間、takt-marp グローバルインストーラは `plan / compose / polish / deliver` の成功条件、状態遷移、report schema、approval ownership を再定義してはならない。

### 6. smoke validation を mock と real で分離できる

**目的:** workflow メンテナとして、CI では決定論的な smoke を実行し、必要なときだけ real provider を明示して検証したい。そうすることで、揺れる real provider 結果を CI の必須条件にせずに global CLI を検証できる。

#### 受け入れ条件

6.1. 利用者が provider を指定せずに `takt-marp smoke` を実行したとき、takt-marp グローバルインストーラは mock provider を既定として smoke validation を実行しなければならない。

6.2. mock provider の smoke validation が実行された場合、takt-marp グローバルインストーラは mock 用であることが分かる検証結果を生成しなければならない。

6.3. 利用者が `takt-marp smoke --provider <name>` を実行したとき、takt-marp グローバルインストーラは指定 provider を使う smoke validation を実行しなければならない。

6.4. real provider の smoke validation が実行された場合、takt-marp グローバルインストーラは real provider 用であることと provider 名が分かる検証結果を生成しなければならない。

6.5. real provider 実行に必要なユーザ環境設定が不足している場合、takt-marp グローバルインストーラは provider 設定を生成せず、利用者が環境設定を確認できる失敗情報を表示しなければならない。

### 7. package template の配布範囲と drift を検証できる

**目的:** workflow メンテナとして、global install 用 template が開発用 workflow/facet とずれたり、禁止ファイルを含んだりしないことを確認したい。そうすることで、利用者プロジェクトへ不要な状態や設定を配布しない。

#### 受け入れ条件

7.1. メンテナが installer validation を実行したとき、takt-marp グローバルインストーラは package template が `workflows/**` と `facets/**` だけを init 対象としていることを検証しなければならない。

7.2. メンテナが installer validation を実行したとき、takt-marp グローバルインストーラは package template に `.takt/config.yaml`、runtime state、provider 設定、認証情報が含まれていないことを検証しなければならない。

7.3. メンテナが template sync validation を実行したとき、takt-marp グローバルインストーラは package template と開発用 `.takt/workflows/**` / `.takt/facets/**` の drift を検出しなければならない。

7.4. package template と開発用 workflow/facet の drift がある場合、takt-marp グローバルインストーラは drift のある path が分かる失敗情報を表示しなければならない。

7.5. メンテナが package 内容を検証したとき、takt-marp グローバルインストーラは package/include 境界と実際の package template 内容の不一致を失敗として扱わなければならない。

### 8. global install 経路を CI で検証できる

**目的:** workflow メンテナとして、公開前に実際の global install 経路で command と init と smoke を確認したい。そうすることで、repo-local 実行だけでは見つからない packaging 問題を検出できる。

#### 受け入れ条件

8.1. CI で installer validation が実行されたとき、takt-marp グローバルインストーラは package tarball を global install 相当の環境に導入して `takt-marp` command を検証しなければならない。

8.2. CI で installer validation が実行されたとき、takt-marp グローバルインストーラは `takt-marp init .` が `.takt/workflows/**` と `.takt/facets/**` だけを生成することを検証しなければならない。

8.3. CI で installer validation が実行されたとき、takt-marp グローバルインストーラは init の衝突失敗と明示上書き動作を検証しなければならない。

8.4. CI で smoke validation が実行されたとき、takt-marp グローバルインストーラは mock provider の smoke を必須検証として扱わなければならない。

8.5. CI で installer validation が実行された場合、takt-marp グローバルインストーラは real provider smoke を必須検証として要求してはならない。
