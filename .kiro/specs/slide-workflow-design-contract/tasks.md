# 実装計画

- [x] 1. 基盤: zip import の実行土台を作る
- [x] 1.1 zip read/write dependency と ZipArchiveReader を追加する
  - `fflate 0.8.3` を package dependency として追加し、zip entry の列挙と entry byte read を runner library から利用できるようにする。
  - zip entry name の absolute path、`..` segment、NUL byte を invalid として扱い、path traversal が importer へ到達しない。leading `./` は common zip convention として正規化する。
  - archive byte size、entry count、total uncompressed size に上限を設け、zip bomb による local / CI の availability 低下を防ぐ。
  - 完了条件: zip entry list / read / invalid entry / dot-prefixed entry / archive limit の fixture が単体検証で確認でき、外部 `unzip` command に依存していない。
  - _Requirements:_ 1.4, 2.1, 8.4, 8.7
  - _Boundary:_ ZipArchiveReader
  - _Depends:_ none

- [x] 1.2 Claude Design Source の smoke fixture builder を追加する
  - `_ds_manifest.json`、`styles.css`、`tokens/colors.css`、`tokens/typography.css`、`tokens/spacing.css`、`_adherence.oxlintrc.json`、`SKILL.md`、`readme.md`、component prompt、card、sample slide、template、asset を含む deterministic zip を検証実行時に生成できるようにする。
  - fixture は generic component / catalog と optional adherence metadata を含み、binary zip を repository に直接追加しなくても smoke validation で利用できる。
  - 完了条件: fixture builder が毎回同じ token / guidance / catalog 構成の Claude Design zip を生成し、生成物を importer の入力として使える。
  - _Requirements:_ 2.2, 2.6, 8.2
  - _Boundary:_ ValidationSurface
  - _Depends:_ 1.1

- [x] 2. コア: Claude Design Source を Resolved Design Contract に変換する
- [x] 2.1 Claude Design Source resolver を実装する
  - target deck の `slides/<deck>/design/` から `_ds_manifest.json` を含む `.zip` を一意に解決する。
  - missing、ambiguous、unreadable、malformed、manifest 不在、valid zip と invalid sibling zip の同居の各失敗で、source path と原因が分かる error code を返す。
  - `design-system.md`、手書き `design-contract.md`、package default を代替入力として扱わない。
  - 完了条件: valid / missing / ambiguous / invalid / legacy file only の各 fixture で resolver の成否と error code を確認できる。
  - _Requirements:_ 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.4, 9.3, 9.4
  - _Boundary:_ ClaudeDesignSourceResolver
  - _Depends:_ 1.1

- [x] 2.2 Claude Design importer を実装する
  - required files と required manifest fields を検証し、manifest が JSON object ではない、token list が空、または manifest token と CSS custom property の名前・値が一致しない場合は import を成功扱いしない。
  - optional files、string / object `brandFonts`、font token、empty/non-empty `components`、adherence metadata、guidance documents、component prompts、cards、sample slides、templates、assets を取り込み、存在しない optional file だけで失敗しない。
  - token category は manifest `kind`、token name prefix、source CSS path の組み合わせで分類する。
  - 完了条件: sample zip から token counts、brand fonts、component count/names、adherence rule summary、guidance、source catalog が Resolved Design Contract 候補として確認できる。
  - _Requirements:_ 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 6.4
  - _Boundary:_ ClaudeDesignImporter
  - _Depends:_ 1.1, 2.1

- [x] 2.3 Resolved Design Contract の保存と fingerprint を固定する
  - normalized JSON を `.takt/design-contracts/<deck>/resolved-design-contract.json` に保存し、source zip SHA-256 と contract SHA-256 を分けて記録する。
  - source path、manifest namespace、token counts、brand fonts、component count、adherence availability、guidance、source catalog を report 可能な metadata として保持する。
  - import failure 時に古い Resolved Design Contract へ fallback しない。
  - `--force` 再実行では import / validation と保存を分け、archive / clean 成功後にだけ新しい Resolved Design Contract を保存する。
  - 完了条件: 同じ source から同じ contract fingerprint が再現し、source 変更時に fingerprint が変わり、archive / clean 失敗時に新しい contract が保存されないことを検証できる。
  - _Requirements:_ 3.1, 3.2, 3.4, 3.6
  - _Boundary:_ ClaudeDesignImporter
  - _Depends:_ 2.2

- [x] 3. 統合: runner と plan に Design Contract を渡す
- [x] 3.1 Workflow Runner の preflight と marker handoff を更新する
  - `plan` と `compose` の実行前に Claude Design Source resolver/importer を呼び、`.takt/workflow-current-target.json` に `design_contract` summary を記録する。
  - research metadata と design metadata を別 field に保ち、Plan Optional Context と混同しない。
  - 通常実行で `.takt/workflows`、`.takt/facets`、package template asset を consumer workspace へ自動コピーしない。
  - `plan` / `compose` の rejected rerun では、rejected artifact archive より前に Claude Design Source を validation する。
  - `polish` / `deliver` / `research` では、同一 target の既存 marker または保存済み Resolved Design Contract から `design_contract` を引き継ぐ。既存 marker が malformed、`design_contract.path` が存在しない stale marker、既存 marker の path が指す Resolved Design Contract が corrupt、または保存済み Resolved Design Contract が corrupt な場合は読み捨て、保存済み marker または `null` へフォールバックする。
  - 完了条件: runner fixture で marker に `design_contract` が入り、research marker と共存しても field が混ざらず、template copy が発生せず、rejected rerun の validation-before-archive、malformed marker からの復旧、stale / corrupt marker の破棄、corrupt existing marker payload の破棄を検証できる。
  - _Requirements:_ 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 7.1, 7.2, 7.3, 7.4
  - _Boundary:_ WorkflowHandoffMarker
  - _Depends:_ 2.3

- [x] 3.2 PlanFacetContract を Design Contract 参照へ更新する
  - plan facets が marker と Resolved Design Contract を読み、token constraints、density hints、adherence rules、guidance、source catalog、既存 layout vocabulary を計画へ反映する。
  - Claude Design zip から components / cards / templates / sample slides / component prompts が得られない場合でも、既存 vocabulary と token constraints の範囲で `Layout` / `Visual Strategy` を記録する。得られる場合は brief に合う reusable element だけを選定する。
  - `plan.md` と `slide-blueprint.md` に contract metadata を残し、CSS、front matter style、`_class` style 定義は生成しない。
  - 完了条件: mock plan artifact に contract metadata があり、CSS/style 定義が plan artifact に混入していないことを検証できる。
  - _Requirements:_ 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.3, 9.1
  - _Boundary:_ PlanFacetContract
  - _Depends:_ 3.1

- [x] 4. コア: compose と review を Design Contract 駆動へ移行する
- [x] 4.1 compose workflow から design-system step を外す
  - compose workflow の initial step を source composition へ移し、`design_system` step と `design-system.md` の canonical artifact 前提を削除する。
  - compose source artifact の成功条件から `design-system.md` を外し、既存 deck に残る legacy file は失敗条件にしない。
  - top-level command surface と approval ownership を `plan / compose / polish / deliver` のまま維持する。
  - 完了条件: workflow YAML と facet inspection で `design_system` route が消え、`design-system.md` が compose 成功条件ではないことを確認できる。
  - _Requirements:_ 5.6, 7.1, 7.2, 7.3, 9.1, 9.2
  - _Boundary:_ ComposeFacetContract
  - _Depends:_ 3.1

- [x] 4.2 compose source generation を fingerprint と token constraints へ接続する
  - compose facets が marker の contract fingerprint と `plan.md` / `slide-blueprint.md` の fingerprint を照合し、不一致を blocker として扱う。
  - fingerprint が一致する場合だけ、Resolved Design Contract の token constraints から `SLIDES.md` front matter CSS、layout class、section HTML/CSS、visual source を生成する。
  - CSS custom properties は Claude Design Source の token 名と値を保持し、raw color、raw px、未提供 font-family の新規混入を避ける。
  - 完了条件: mock compose artifact に token-driven CSS と layout classes が生成され、fingerprint mismatch fixture では source artifact 成功にならない。
  - _Requirements:_ 5.1, 5.2, 5.3, 5.4, 5.5, 5.8
  - _Boundary:_ ComposeFacetContract
  - _Depends:_ 3.2, 4.1

- [x] 4.3 compose review / fix / summary を Design Contract review へ更新する
  - compose review が plan、blueprint、marker の fingerprint 一致、`_class` / style 定義、HTML visual の token constraint 適合を確認する。
  - `_adherence.oxlintrc.json` がある場合、raw hex color、raw px value、未提供 font-family を review finding として扱う。ただし Resolved Design Contract 由来の custom property 定義は正当な token 定義として除外する。
  - compose fix と work summary は `design-system.md` を修正対象や成功条件にせず、re-plan または Claude Design Source 更新が必要な場合を報告できる。
  - polish inspect / fix は `design_contract.path` がある場合に Resolved Design Contract を読み、marker と Resolved Design Contract の `fingerprint.contract_sha256`、`SLIDES.md`、`_class`、`sections/*`、HTML visual、`images/*` を token constraints、brand fonts、adherence metadata、`guidance`、`source_catalog` と照合する。
  - polish inspect / fix は Design Contract がない既存 deck を legacy path として扱い、fingerprint / token drift 判定だけをスキップして render evidence と既存 source artifact の visual/layout/render 修正を許可する。
  - 完了条件: review fixture で approved / needs_fix / blocked の各結果が Design Contract metadata と finding evidence から判定でき、通常 polish path が Design Contract drift を検出し、legacy polish が Design Contract 不在だけで blocked にならない。
  - _Requirements:_ 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 9.2, 9.5
  - _Boundary:_ ComposeFacetContract
  - _Depends:_ 4.2

- [x] 5. 検証: validation surface と no-copy 回帰を固定する
- [x] 5.1 foundation validation を Design Contract 契約へ拡張する
  - marker shape、plan metadata、compose fingerprint check、legacy `design-system.md` 非依存を static assertion として検証する。
  - compose workflow から `design_system` step が消えていることと、facet 文言が `design-system.md` を canonical source artifact として要求していないことを検証する。
  - invalid sibling zip、JSON object ではない manifest、object 形式の `brandFonts`、`--force` archive 失敗時の Resolved Design Contract 非保存、rejected rerun の validation-before-archive、malformed marker からの復旧、stale / corrupt marker の破棄、legacy polish path を検証する。
  - 完了条件: foundation validation が marker / plan / compose / facet 文言 / hardening regression を path 付きで検出できる。
  - _Requirements:_ 2.8, 3.8, 5.6, 5.7, 8.3, 8.7, 9.2, 9.5
  - _Boundary:_ ValidationSurface
  - _Depends:_ 4.3

- [x] 5.2 smoke validation を Claude Design Source import path へ更新する
  - smoke fixture の Claude Design zip を使い、source 解決、Resolved Design Contract 生成、plan metadata、compose CSS token application、fingerprint match を検証する。
  - `design-system.md` existence assertion を削除し、guidance / source catalog と optional adherence metadata を valid sample として扱う。
  - validation failure 時に source file、対象 command、確認すべき artifact が分かる summary を出す。
  - 完了条件: `npm run slide:smoke -- --provider mock` が Claude Design Source 契約を通り、失敗時は missing / ambiguous / invalid / mismatch の原因が分かる。
  - _Requirements:_ 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.6, 3.1, 3.2, 3.3, 4.5, 5.1, 5.2, 5.3, 8.1, 8.2, 8.6
  - _Boundary:_ ValidationSurface
  - _Depends:_ 1.2, 5.1

- [x] 5.3 (P) package / global install / no-copy validators を更新する
  - package boundary validation が importer library、zip adapter、fixture builder を package 実行可能な範囲として検証する。
  - global install validation が package path から importer を実行でき、通常実行で `.takt/workflows` / `.takt/facets` を生成しないことを確認する。
  - eject は workflow/facet template の既存契約だけを維持し、Claude Design Source や internal Design Contract を package default として生成しない。
  - 完了条件: package boundary、global install、bundled research no-copy validation が Claude Design import 後の no-copy regression を検出できる。
  - _Requirements:_ 7.4, 7.5, 8.4, 8.5
  - _Boundary:_ ValidationSurface
  - _Depends:_ 3.1, 4.1

- [x] 6. 統合: workflow 契約の診断と完了条件を閉じる
- [x] 6.1 移行案内を runner / facet / validator の診断へ組み込む
  - source 不在、legacy `design-system.md` 検出、fingerprint mismatch の各診断で、Claude Design Source の配置先と移行時の確認対象が分かる message を返す。
  - plan / compose / review / validation の summary が、手書き contract、bundled default、deck-local Markdown override を初期 scope として案内しないようにする。
  - 完了条件: source 不在と legacy file fixture で移行案内が表示され、`plan` が CSS を生成しない契約を利用者向け summary から確認できる。
  - _Requirements:_ 1.5, 4.4, 5.6, 7.1, 7.2, 9.3, 9.4
  - _Boundary:_ ValidationSurface
  - _Depends:_ 5.2

- [x] 6.2 全体 regression を実行して task graph を完了可能にする
  - `npm test`、installer validation、template drift check、package boundary check を実行し、Design Contract 導入後も既存 command/state/no-copy 契約が崩れていないことを確認する。
  - 失敗が出た場合は該当 boundary の task へ戻し、検証 task 側で回避策を入れない。
  - 完了条件: required regression command が zero exit になり、残る制約や未解決事項がある場合は task notes に明示される。
  - _Requirements:_ 7.1, 7.2, 7.3, 7.4, 8.1, 8.3, 8.4, 8.5, 8.6, 9.1
  - _Boundary:_ ValidationSurface
  - _Depends:_ 5.2, 5.3, 6.1
