# 実装計画

- [ ] 1. 基盤: global 実行と template 境界の土台を整える
- [x] 1.1 package install 境界を global CLI 契約へ更新する
  - global install 後に `takt-marp` が PATH から起動できる bin、runtime dependency、Node.js runtime、package include 境界を宣言する
  - package に含める範囲を CLI、workflow 実行、template、smoke、Marp utility の実行に必要なものへ限定する
  - 完了条件: package metadata と pack dry-run 検証で PATH 起動、対応 Node.js version、include 境界の期待値が確認できる
  - _Requirements:_ 1.1, 1.5, 7.5, 8.1
  - _Boundary:_ PackageMetadata
  - _Depends:_ none

- [ ] 1.2 CLI entry の version guard と dispatcher 起動を確立する
  - 未対応 Node.js runtime では workflow を開始せず、必要 version が分かる失敗情報を返す
  - 対応 runtime では global CLI entry から command dispatcher へ処理を委譲する
  - 完了条件: 対応外 runtime の失敗と対応 runtime の dispatcher 起動を、CLI entry 単体の検証で再現できる
  - _Requirements:_ 1.1, 1.5
  - _Boundary:_ CliEntry
  - _Depends:_ 1.1

- [ ] 1.3 package root と project root を分離した runtime 解決を固定する
  - global package 側の `takt`、Marp utility、内部実行 script を対象 project の `package.json` や `node_modules` に依存せず解決する
  - workflow 実行時の current working directory は対象 project として維持し、target project の `npm run` 経由へ戻らないようにする
  - 完了条件: `package.json` と `node_modules` がない対象 project でも、それらの不在だけを理由に workflow command が失敗しないことを検証できる
  - _Requirements:_ 2.5, 2.7, 5.5
  - _Boundary:_ RuntimeContext
  - _Depends:_ 1.1

- [ ] 1.4 workflow と template が共有する error 境界を独立させる
  - `init` 廃止、partial template state、eject conflict、target error、workflow file 欠落を一貫した error code と表示形式で扱う
  - template 判定側と slide workflow 側が相互 import せず、共通 error 境界だけを参照する構造にする
  - 完了条件: 主要 error code の表示形式が単体検証で固定され、template と workflow の import 循環が発生しない
  - _Requirements:_ 1.4, 2.4, 4.1, 5.2
  - _Boundary:_ TaktMarpErrors
  - _Depends:_ none

- [ ] 1.5 bundled template の配布対象を workflow/facet だけに固定する
  - bundled 実行と eject の対象を `.takt/workflows/**` と `.takt/facets/**` に限定し、provider 設定、runtime state、認証情報を除外する
  - template entry の列挙と禁止 pattern 検査を、eject、resolver、validator が同じ前提で使えるようにする
  - 完了条件: template 列挙が workflow/facet だけを返し、禁止対象を含む template は path 付きで検出される
  - _Requirements:_ 3.3, 3.4, 7.1, 7.2
  - _Boundary:_ ProjectTemplateSet
  - _Depends:_ 1.4

- [ ] 2. コア: no-copy template selection と eject を実装する
- [ ] 2.1 TemplateSourceResolver で bundled/ejected/partial state を判定する
  - 対象 project に workflow/facet の両方がない場合は package bundled template を no-copy で選ぶ
  - 両方がある場合は ejected override として扱い、片方だけの場合は混在させず修復が必要な失敗にする
  - current working directory だけを対象 project として扱い、親 directory を暗黙探索しない
  - 完了条件: none、both、partial の各 template state が期待どおりの source selection または失敗情報になる
  - _Requirements:_ 2.1, 2.2, 2.3, 2.4, 2.6, 8.3
  - _Boundary:_ TemplateSourceResolver
  - _Depends:_ 1.3, 1.5

- [ ] 2.2 (P) ProjectEjector で明示的な template copy だけを提供する
  - `eject .` と `eject <dir>` は workflow/facet template だけを対象 directory へ生成する
  - runtime state、provider 設定、認証情報、template 対象外ファイルは成功時も force 時も生成・削除・変更しない
  - 既存 template 対象ファイルは既定で衝突一覧付きの書き込みゼロ失敗にし、`--force` と `--overwrite` の明示時だけ template 対象を上書きする
  - takt-marp upgrade 時に ejected assets を自動 merge、自動置換、best-effort 更新しない前提を挙動として固定する
  - 完了条件: 通常 eject、衝突失敗、force 上書き、対象外ファイル不変、state/config 非生成を一時 project で検証できる
  - _Requirements:_ 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 8.4, 8.5
  - _Boundary:_ ProjectEjector
  - _Depends:_ 1.5

- [ ] 2.3 (P) TemplateSyncValidator で開発用 workflow/facet との drift を検出する
  - package bundled template と開発用 `.takt/workflows/**` / `.takt/facets/**` の byte drift を検出する
  - drift がある場合は、差分種別と path が分かる失敗情報を返す
  - 完了条件: 同期済み状態では成功し、template 側または開発用側の差分を入れると path 付きで失敗する
  - _Requirements:_ 7.3, 7.4
  - _Boundary:_ TemplateSyncValidator
  - _Depends:_ 1.5

- [ ] 2.4 (P) PackageBoundaryValidator を eject/no-copy 前提へ更新する
  - package 内容が workflow/facet template、runtime 実行物、smoke fixture、utility 実行物の範囲に収まることを検証する
  - `init` 前提の必須 file や project-local template 必須化を除去し、禁止 pattern と include 境界の不一致を失敗にする
  - 完了条件: 正常 package は成功し、禁止 file 混入や include 境界の欠落は path または項目名付きで失敗する
  - _Requirements:_ 7.1, 7.2, 7.5
  - _Boundary:_ PackageBoundaryValidator
  - _Depends:_ 1.1, 1.5

- [ ] 3. 統合: CLI command surface と workflow 実行を接続する
- [ ] 3.1 CommandDispatcher の public command surface を置き換える
  - help に `eject`、`plan`、`compose`、`polish`、`deliver`、`approve`、`smoke`、`build:html`、`build:pdf`、`build:pptx`、`preview` を表示する
  - `slide:*` は global CLI の有効 command として扱わず、`init` は廃止済みとして `eject` guidance を返す
  - `eject` の対象 directory と `--force` / `--overwrite` を ProjectEjector へ渡す
  - 完了条件: help、未知 command、`slide:*` 拒否、`init` 廃止、`eject` 委譲が CLI 検証で確認できる
  - _Requirements:_ 1.2, 1.3, 1.4, 2.1, 2.6, 3.1, 3.2, 4.3
  - _Boundary:_ CommandDispatcher
  - _Depends:_ 2.1, 2.2

- [ ] 3.2 SlideWorkflowLib を selected template source で動く薄い契約層にする
  - selected template source の workflow path を使い、target contract、prerequisite、rerun blocking、force invalidation、report freshness、approval ownership を再定義せず維持する
  - 無効 target は TAKT workflow 開始前に既存 slide workflow と同等の target error として返す
  - 完了条件: invalid target、既存成功状態、force 指定、provider 指定の既存契約が global CLI 経由でも同じ判定になる
  - _Requirements:_ 5.1, 5.2, 5.3, 5.4, 5.5
  - _Boundary:_ SlideWorkflowLib
  - _Depends:_ 1.4

- [ ] 3.3 WorkflowRunner で no-copy workflow 実行を実現する
  - TemplateSourceResolver の選択結果から workflow file を明示指定し、target project へ template assets をコピーしない
  - TAKT は global package 側 runtime から直接起動し、target project の `npm run` を経由しない
  - provider 引数は workflow 実行へ素通しし、cwd は対象 project のまま維持する
  - 完了条件: bundled no-copy、ejected override、partial state、npm project 不在の各経路が期待どおりに成功または失敗する
  - _Requirements:_ 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 5.1, 5.3, 5.4, 5.5, 8.3
  - _Boundary:_ WorkflowRunner
  - _Depends:_ 2.1, 3.2

- [ ] 3.4 approve command から template asset preflight を外す
  - `approve` は approval file の読み書きに必要な既存 contract だけを使い、workflow/facet template の存在を要求しない
  - command dispatch は approve を workflow command と混同せず、template source selection を不要なまま維持する
  - 完了条件: workflow/facet template がない対象 project でも、approval contract の成否だけで `approve` の結果が決まる
  - _Requirements:_ 1.2, 5.6
  - _Boundary:_ CommandDispatcher, ApproveScript
  - _Depends:_ 3.1

- [ ] 3.5 retained utility commands を package runtime で維持する
  - `build:html`、`build:pdf`、`build:pptx`、`preview` は help と dispatch の public command として残す
  - Marp utility は package root 側 runtime を使い、target project の local install 有無に依存しない
  - 完了条件: utility command の help 表示と package runtime 解決が、target project の `node_modules` 不在でも確認できる
  - _Requirements:_ 1.2, 2.5, 5.5
  - _Boundary:_ CommandDispatcher, BuildAndPreview
  - _Depends:_ 1.3, 3.1

- [ ] 4. smoke: mock/real 分離と no-copy 検証を実装する
- [ ] 4.1 SmokeEntry を no-copy temp project 実行へ変更する
  - provider 未指定時は mock provider を既定にし、指定時は provider 名を smoke validation へ素通しする
  - smoke 用 workspace は利用者 cwd を汚さず、temp project にも既定で workflow/facet template を eject しない
  - real provider 設定が不足している場合も provider 設定を生成せず、環境確認につながる失敗情報を返す
  - 完了条件: user cwd に template、provider 設定、runtime state を生成せず、mock 既定と provider pass-through が確認できる
  - _Requirements:_ 6.1, 6.3, 6.5, 6.6, 6.7, 8.7
  - _Boundary:_ SmokeEntry
  - _Depends:_ 3.3

- [ ] 4.2 SmokeValidator が selected template source を検査に使うようにする
  - workflow inspection と workflow doctor は global CLI と同じ TemplateSourceResolver 規則で選ばれた template source を参照する
  - mock summary は mock 用、real summary は provider 名付き real 用として区別できる検証結果にする
  - smoke temp project に workflow/facet template が生成されていないことを assertion として固定する
  - 完了条件: smoke validation の inspection、doctor、summary、no-copy assertion が bundled template と ejected override の両方で確認できる
  - _Requirements:_ 6.2, 6.4, 6.7, 8.6
  - _Boundary:_ SmokeValidator
  - _Depends:_ 4.1

- [ ] 4.3 smoke regression で mock 必須・real 任意の契約を固定する
  - `takt-marp smoke` は mock provider で完走することを必須検証にする
  - `--provider <name>` は指定 provider の結果を生成するが、CI 必須条件として real provider 成功を要求しない
  - provider 設定不足時に設定ファイルを生成しないこと、user cwd と temp project の no-copy 状態を検証する
  - 完了条件: mock smoke、provider 指定、設定不足、no-copy temp project の各回帰が自動検証で固定される
  - _Requirements:_ 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 8.6, 8.7
  - _Boundary:_ SmokeEntry, SmokeValidator
  - _Depends:_ 4.2

- [ ] 5. 検証: global install 経路と stale init 前提を固定する
- [ ] 5.1 GlobalInstallValidator を no-copy/eject 契約へ更新する
  - tarball を global install 相当の環境へ導入し、PATH 経由の `takt-marp` command を検証する
  - help surface は `init` を含まず、eject、workflow、approve、smoke、retained utility command を含むことを検証する
  - no-copy workflow は未初期化エラーで停止せず、target project へ workflow/facet template をコピーしないことを検証する
  - eject の生成境界、衝突失敗、force 上書き、mock smoke、real smoke 非必須を phase ごとに検証する
  - 完了条件: global install validator が全 phase pass し、任意 phase の失敗時は phase 名と失敗内容が分かる
  - _Requirements:_ 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 2.4, 2.5, 3.1, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
  - _Boundary:_ GlobalInstallValidator
  - _Depends:_ 3.3, 4.3

- [ ] 5.2 installer validation の CI 入口を更新する
  - template drift、package boundary、foundation、global install、mock smoke の検証を CI から実行できる command 列に揃える
  - real provider smoke は CI 必須条件に含めず、明示実行時だけ失敗を表面化する
  - 完了条件: CI と同じ command 列をローカルで実行でき、template drift、package 境界、global install、mock smoke の失敗が無視されない
  - _Requirements:_ 7.3, 7.4, 7.5, 8.1, 8.6, 8.7
  - _Boundary:_ CI配線
  - _Depends:_ 2.3, 2.4, 5.1

- [ ] 5.3 stale init 前提を検出して除去する
  - public command、validator、smoke、package boundary に残る `init` 有効化や project-local template 必須化の前提を失敗条件として扱う
  - ejected assets は upgrade で自動置換されないことを、validator と回帰検証の期待値に含める
  - 完了条件: `init` が有効 command として表示または実行される変更、ならびに ejected assets の暗黙更新は自動検証で失敗する
  - _Requirements:_ 1.4, 3.6, 8.2
  - _Boundary:_ IntegrationCleanup
  - _Depends:_ 5.2

- [ ] 5.4 全経路の回帰を実行して実装可能状態を確認する
  - foundation、template drift、package boundary、global install、mock smoke、workflow no-copy、eject conflict の検証を一通り実行する
  - 失敗が出た場合は該当境界のタスクへ戻して修正し、検証タスク側で回避策を入れない
  - 完了条件: no-copy workflow と eject-only template copy の主要 command がすべて exit 0 で完走したログが揃う
  - _Requirements:_ 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
  - _Boundary:_ 統合検証
  - _Depends:_ 5.3
