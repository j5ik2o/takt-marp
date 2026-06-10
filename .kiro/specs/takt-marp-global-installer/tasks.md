# 実装計画

- [ ] 1. 基盤: 実行基盤と package 境界を確立する
- [x] 1.1 project root と分離された runtime context 解決を提供する
  - takt-marp package 自身の位置から package root と実行ファイル置き場を決定論的に導出し、cwd の影響を受けずに takt / marp の実行ファイル path と package 内 script path を解決できるようにする
  - 既存 foundation validation が使う明示 root の override を引き続き受け付ける
  - Windows の実行ファイル拡張子差(.cmd)を既存実装と同じ規則で扱う
  - 完了条件: repo root で解決される takt / marp の path が従来の cwd 基準の解決結果と一致し、別 directory から実行しても同じ path が返る
  - _Requirements:_ 4.3, 5.1
  - _Boundary:_ RuntimeContextResolver
  - _Depends:_ none

- [x] 1.2 既存の実行ファイル解決を package 基準へ差し替える
  - workflow runner が使う takt 解決の既定を cwd 基準から package 基準へ変更し、明示 root override の互換を維持する
  - slide artifact build の marp 解決も同じ解決機構へ揃える
  - 実行ファイル不在時のエラーメッセージを global install 文脈(takt-marp の再 install 案内)へ更新する
  - workflow の成功条件・状態遷移・report sync には手を入れない
  - foundation validation の spawn 型 fixture(runner subprocess + fake takt)を packageRoot / projectRoot 分離レイアウトへ追随させる(assertion・期待エラーコードは不変。design「変更対象ファイル」参照)
  - 完了条件: `npm test`(foundation validation)が成功し、repo-local の `npm run slide:*` 入口が従来どおり動作する
  - _Requirements:_ 4.3, 5.1, 5.5
  - _Boundary:_ 既存 lib / build / smoke の変更, foundation validation fixture
  - _Depends:_ 1.1

- [x] 1.3 (P) package metadata の境界を宣言する
  - bin entrypoint、files allowlist(bin / scripts / templates / smoke fixture / marp 設定)、engines.node >= 24 を宣言する
  - takt、Marp CLI、kroki plugin を runtime dependencies へ移行し、yargs override を維持したまま lockfile を再生成する
  - installer 系 npm scripts(同期 / drift 検証 / package 境界検証 / global install 検証)の入口を追加する(実体 script は後続タスクで作成)
  - bin の実体ファイルは後続タスクで作成されるため、この時点では global install 経路は未検証でよい
  - 完了条件: `npm ci` と `npm test` が成功し、`npm pack --dry-run` の file 一覧が allowlist の範囲に収まる
  - _Requirements:_ 1.1, 1.4, 4.3
  - _Boundary:_ PackageMetadata
  - _Depends:_ none

- [ ] 2. コア: installer コンポーネント群を実装する
- [x] 2.1 (P) 配布 template の境界定義を実装する
  - workflows / facets の 2 domain に固定した allowlist、禁止 pattern(provider 設定・runtime state・認証情報など)、template entry の列挙を単一の定義として実装する
  - 2 つの tree(配布正本と開発用 .takt)の差分(欠落 / 内容不一致)を byte 単位で計算できるようにする
  - 完了条件: 列挙結果が workflows / facets 配下のみを返し、禁止 pattern を含む tree に対する検証が違反 path を報告して失敗する
  - _Requirements:_ 2.3, 2.4, 7.1, 7.2
  - _Boundary:_ ProjectTemplateSet
  - _Depends:_ 1.1

- [x] 2.2 template の同期と drift 検証を実装し配布正本を生成する
  - 開発用 .takt から配布正本への同期(書き込みモード)と、drift 検出(既定モード、種別ごとの path 一覧表示と失敗)を実装する
  - 初回同期を実行して配布正本(workflows / facets)を repo に生成し、git 管理下へ置く
  - 完了条件: 同期直後の drift 検証が成功し、template 側 1 file を改変すると該当 path を表示して失敗する
  - _Requirements:_ 7.3, 7.4
  - _Boundary:_ TemplateSyncValidator
  - _Depends:_ 2.1

- [x] 2.3 project initializer を実装する
  - 指定 directory(既定は現在地)へ template entry のみをコピーし、中間 directory を必要に応じて作成する
  - 全 entry の衝突を書き込み前に走査し、衝突があれば書き込みゼロのまま衝突 path 全件を表示して失敗する
  - `--force` / `--overwrite`(完全 alias)指定時のみ template 対象 path の上書きを許可し、対象外の既存ファイルはどの分岐でも変更しない
  - 対象 directory 不在時は明確なエラーで失敗する
  - 完了条件: 一時 directory への初期化で workflows / facets のみが生成され、再実行が衝突一覧付きで失敗し、force 指定で template 対象だけが上書きされる
  - _Requirements:_ 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5
  - _Boundary:_ ProjectInitializer
  - _Depends:_ 2.1, 2.2

- [x] 2.4 (P) 既存 smoke script を global 経路対応にする
  - smoke の project root を script 位置基準から cwd 基準へ変更する(fixture と runner の package 内解決は不変)
  - npm run 経由の 3 spawn(approve 系と workflow command 系)を package 内 script の直接起動へ置換する(検証意味論は不変)
  - workflow doctor の takt 解決を runtime context 経由へ変更する
  - 検証 phase の構成・provider 分離・summary 生成には手を入れない
  - 完了条件: repo root での `npm run slide:smoke` が従来どおり成功し、smoke script 内に npm run 経由の spawn が残っていない
  - _Requirements:_ 6.1, 8.4
  - _Boundary:_ 既存 lib / build / smoke の変更
  - _Depends:_ 1.1, 1.2

- [x] 2.5 global CLI の入口と command dispatch を実装する
  - bin entry: Node version guard(24 未満は必要 version を表示して失敗)後に dispatcher を起動する
  - help(引数なし / --help)で 6 command を表示して正常終了し、それ以外の command(slide:* 形式を含む)は有効 command 一覧付きで失敗する
  - workflow command は cwd 直下の workflows / facets の存在を確認し(親 directory は探索しない)、欠落時は初期化の案内付きで失敗、存在時は cwd を維持したまま package 内 runner script を直接起動して引数を素通しし、exit code を伝播する(npm run は経由しない)
  - init subcommand は対象 directory と force option を解析して initializer を呼び出し、成功時は次手順(provider 設定がユーザ所有であること、workflow 実行例)を案内する(ファイル生成はしない)
  - 完了条件: repo 内から bin を直接実行して、help 表示 / 未知 command 拒否 / 未初期化検出 / init 実行 / init 済み一時 project での workflow command 委譲(runner の target エラーが表面化)が確認できる
  - _Requirements:_ 1.2, 1.3, 1.4, 2.2, 4.1, 4.2, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5
  - _Boundary:_ CliEntry, CommandDispatcher
  - _Depends:_ 1.2, 2.3

- [x] 2.6 smoke subcommand を実装する
  - 一時プロジェクトを作成して initializer で template を導入し、cwd を一時プロジェクトにして既存 smoke script を起動、provider 指定を素通しする(未指定時は smoke script の mock 既定が適用される)
  - 終了後に結果と一時プロジェクト path(provider 別 summary の所在)を表示し、一時プロジェクトは保持する
  - TAKT が provider 設定ファイル不在で実行できるか(mock 指定時 / 未指定時)を検証し、不可の場合のみ一時プロジェクト内に限り ephemeral な最小設定を生成する(利用者 project へは生成しない)
  - real provider の設定不足は失敗としてそのまま表面化させ、provider 設定の生成・変更は行わない
  - 完了条件: `takt-marp smoke` 相当の実行が一時プロジェクトで mock smoke を完走し、mock 用と分かる検証結果の所在が表示される
  - _Requirements:_ 6.1, 6.2, 6.3, 6.4, 6.5
  - _Boundary:_ SmokeEntry
  - _Depends:_ 2.4, 2.5

- [ ] 3. 統合: installer 検証と CI を配線する
- [x] 3.1 package 境界検証を実装する
  - 配布正本 tree が workflows / facets のみで構成され禁止 pattern を含まないこと、npm pack の実 file 一覧が files allowlist と過不足なく整合すること、bin / engines / runtime dependencies の宣言が揃っていることを検証する
  - pack 内容の必須 assertion は bin 実体・runner / smoke / lib script・template 全 entry を対象とする(検証 script 自身は allowlist 内包で足り、必須 assertion の対象にしない)
  - 違反時は違反 path / 欠落項目の一覧を表示して失敗する
  - 負シナリオ(allowlist から template を外す・禁止 file を混入させる)の動作確認は repo を変異させず、隔離した一時 copy 上で行う
  - 完了条件: 正常構成で成功し、負シナリオの各ケースで違反一覧付きの失敗になる
  - _Requirements:_ 1.4, 7.1, 7.2, 7.5
  - _Boundary:_ PackageBoundaryValidator
  - _Depends:_ 1.3, 2.2, 2.5

- [x] 3.2 global install の E2E 検証を実装する
  - tarball を一時 npm prefix へ global install し、PATH 経由で help 表示と slide:* 拒否を確認する
  - 一時 target project での init が workflows / facets のみを生成し(provider 設定・runtime state 不在、事前置きした対象外 file 不変)、再 init の衝突失敗(書き込みゼロ)と force 上書きが要件どおり動くことを検証する
  - 未初期化 directory での workflow command が初期化案内で失敗すること、init 済みかつ package.json / node_modules 不在の project で npm project 不在以外の理由でのみ失敗すること、provider 設定不在時の失敗モードが npm project 不在を理由にしないことを assertion として固定する
  - mock provider の smoke を必須 phase として実行し、real provider は実行も必須化もしない
  - 完了条件: 検証一式が全 phase pass で成功し、任意の phase 失敗が phase 名付きの失敗情報になる
  - _Requirements:_ 1.1, 1.2, 1.3, 4.2, 4.3, 8.1, 8.2, 8.3, 8.4, 8.5
  - _Boundary:_ GlobalInstallValidator
  - _Depends:_ 1.3, 2.6

- [ ] 3.3 CI を Node 24 と installer 検証へ更新する
  - CI の Node version を 24 へ更新し、既存の test と repo-local smoke step を維持したまま、template drift 検証・package 境界検証・global install 検証の step を追加する
  - real provider smoke を CI の必須条件に含めない
  - 完了条件: CI 定義に新 step が追加され、同じ command 列がローカルで全て成功する
  - _Requirements:_ 7.3, 8.1, 8.4, 8.5
  - _Boundary:_ CI 配線
  - _Depends:_ 3.1, 3.2

- [ ] 4. 検証: 全経路の回帰を確認する
  - クリーンな依存状態から、foundation validation(npm test)、repo-local mock smoke、template drift 検証、package 境界検証、global install E2E 検証を順に実行し、すべて成功させる
  - 失敗が出た場合は該当タスクへ戻して修正し、ここでは回避策を入れない
  - 完了条件: 上記 5 系統の command がすべて exit 0 で完走したログが揃う
  - _Requirements:_ 5.1, 5.5, 6.1, 7.3, 7.5, 8.1, 8.4
  - _Boundary:_ 統合検証(全 validator 横断)
  - _Depends:_ 3.3

## Implementation Notes

- 3.1: `installer:check-package` はこの開発端末ではローカル未追跡 `scripts/run-*.sh` を検出して意図どおり失敗する(dirty-workstation publish 防止)。クリーン checkout / CI では成功する。タスク 4 の回帰はクリーン clone 相当の環境で実行すること。
- 2.6: TAKT 0.44 は `.takt/config.yaml` 不在(かつ `TAKT_CONFIG_DIR` 空)でも `--provider mock` の full smoke を完走する。ephemeral config 分岐は不要だった。3.2 の validator は「config 不在の workflow command 失敗モード」観測時にこの前提(TAKT 自体は config 不要、失敗は target/brief 系エラー)を踏まえること。
- 1.3: `files` の `scripts/` は directory 単位のため、git 未追跡のローカル file(例: `scripts/run-claude-*.sh`、`.git/info/exclude` 管理)も `npm pack` に同梱され得る。3.1 の PackageBoundaryValidator は git 追跡状態または file pattern(`takt-marp-*.mjs` / `lib/`)で予期しない scripts 同梱を検出すること。
- 1.2: foundation validation の 8 チェックは runner を subprocess 起動し fake takt を fixture cwd の `node_modules/.bin` に置く方式のため、`options.root` override では互換にならない。fixture は fake packageRoot(runner / lib / runtime-context をコピー、fake takt は fake packageRoot 側)で global レイアウトをモデル化する。symlink は ESM の realpath 解決で packageRoot が repo に戻るためコピー必須。assertion・期待エラーコードは upstream 所有の契約本体なので変更禁止。
