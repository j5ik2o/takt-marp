# 調査・設計判断

## 要約

- **機能**: `slide-workflow-design-contract`
- **ディスカバリー範囲**: 既存 slide workflow への複雑な統合
- **主要な発見**:
  - 現行 `compose` は `design_system` step から始まり、`design-system.md` を canonical source artifact として生成・参照している。
  - workflow runner は `.takt/workflow-current-target.json` を全 command の handoff marker として既に書き出しており、Design Contract の解決結果を渡す接点にできる。
  - 旧案の package template 配布は `.takt/{workflows,facets}` と `templates/project/{workflows,facets}` の drift validation を持つが、Design Profile 用の配布 domain は未定義である。
  - smoke validation は `design-system.md` の存在を compose 成功の検証に含めているため、Design Contract 導入時に検証対象を置き換える必要がある。
  - Claude Design を primary source にする場合、Design Contract は user-facing な手書き入力ではなく workflow-facing な正規化 artifact に下げられる。ただし公式 docs では export bundle の機械可読 schema が公開されていないため、実サンプルによる export format discovery が必要である。

## 調査ログ

### 現行 compose の生成境界

- **背景**: `design-system.md` を compose から外す場合、どの step と facet が影響を受けるかを確認した。
- **参照した情報源**:
  - `templates/project/workflows/takt-marp-slide-compose.yaml`
  - `.takt/workflows/takt-marp-slide-compose.yaml`
  - `templates/project/facets/instructions/takt-marp-design-system.md`
  - `templates/project/facets/instructions/takt-marp-compose-sections.md`
  - `templates/project/facets/instructions/takt-marp-assemble-slides.md`
  - `templates/project/facets/instructions/takt-marp-compose-review.md`
  - `docs/marp-slide-workflow.md`
- **発見**:
  - `compose` workflow の `initial_step` は `design_system` で、`design-system.md` 作成が後続 step の前提になっている。
  - `assemble_slides`、`compose-review`、`compose-fix`、`polish-inspect`、`polish-fix`、`ai-antipattern-fix` も `design-system.md` を判断材料としている。
  - `docs/marp-slide-workflow.md` は deck structure、design-system 契約、compose artifact に `design-system.md` を含めている。
- **含意**:
  - `design_system` step を削除するだけでは不十分で、plan/compose/review/polish で参照する設計制約を Design Contract に差し替える必要がある。
  - 既存 `design-system.md` は legacy artifact として無視可能にし、成功条件や override 条件に使わない。

### handoff marker の利用可能性

- **背景**: `plan` と `compose` が同じ Resolved Design Contract を読む接点を探した。
- **参照した情報源**:
  - `scripts/takt-marp-run-slide-workflow.mjs`
  - `templates/project/facets/output-contracts/takt-marp-research-sources.md`
  - `templates/project/facets/instructions/takt-marp-ai-antipattern-review.md`
- **発見**:
  - runner は command 実行前に `.takt/workflow-current-target.json` を作成し、`command`、`target`、`deck`、research metadata を書き込む。
  - 複数の facet は既に marker を読み、target や source report を判断している。
  - marker は workspace-local だが、通常実行で workflow/facet template を consumer workspace にコピーしない no-copy 経路と衝突しない。
- **含意**:
  - runner に Design Contract resolver を追加し、marker の `design_contract` に source、path、fingerprint を記録するのが最小変更である。
  - `plan` 成果物へ fingerprint を記録し、`compose` は現在の fingerprint と照合することで「同じ契約」を検証できる。

### Template Distribution

- **背景**: bundled default Design Profile を package に含め、開発用正本との drift を検出する方法を確認した。
- **参照した情報源**:
  - `scripts/lib/takt-marp-project-templates.mjs`
  - `scripts/takt-marp-sync-project-templates.mjs`
  - `scripts/takt-marp-validate-package-boundary.mjs`
  - `scripts/lib/takt-marp-project-eject.mjs`
  - `scripts/lib/takt-marp-cli.mjs`
- **発見**:
  - 現在の `TEMPLATE_DOMAINS` は `workflows` と `facets` のみで、eject、drift check、package boundary が同じ列挙を使っている。
  - `eject` は `listTemplateEntries()` の全 entry を `.takt/<relativePath>` へコピーする。
  - CLI の user-facing 説明は `.takt/workflows` と `.takt/facets` のコピーに限定されている。
- **含意**:
  - Design Profile を package template domain に追加する場合、ejectable domain と packaged domain を分ける必要がある。
  - 通常実行は package 内の `templates/project/design-profiles/default/design-contract.md` を読むだけにし、consumer workspace へ `.takt/workflows`、`.takt/facets`、Design Profile を自動生成しない。

### Validation Surface

- **背景**: Design Contract 導入後の検証をどこに追加すべきか確認した。
- **参照した情報源**:
  - `scripts/takt-marp-validate-slide-workflow-smoke.mjs`
  - `scripts/takt-marp-validate-slide-workflow-foundation.mjs`
  - `scripts/takt-marp-validate-global-install.mjs`
  - `scripts/takt-marp-validate-bundled-research-no-copy.mjs`
- **発見**:
  - smoke validation は compose source artifact として `design-system.md` を期待している。
  - foundation validation は marker、workflow availability、template source、plan output contract を広く検証している。
  - global install / no-copy validation は `.takt/workflows`、`.takt/facets`、provider settings などの生成禁止を確認している。
- **含意**:
  - smoke は `design-system.md` 存在ではなく、Resolved Design Contract の決定、plan fingerprint、compose 適用、deck-local override の区別を検証する。
  - package boundary は bundled default Design Profile が pack に含まれることを検証する。
  - no-copy validation は通常実行で template assets が生成されないことを引き続き検証する。

### Claude Design export format discovery

- **背景**: 利用者はデザインシステムの良し悪しを Markdown だけで判断しない。Claude Design の Design System を primary source とし、この tool は workflow 用の Resolved Design Contract へ正規化する方針に寄せる。
- **参照した情報源**:
  - Claude Help Center「Get started with Claude Design」
  - Claude Help Center「Set up your design system in Claude Design」
  - Anthropic「Introducing Claude Design by Anthropic Labs」
  - repo 内検索: Claude Design export / handoff / design bundle の既存サンプルは未発見
- **発見**:
  - Claude Design は export として `.zip`、PDF、PPTX、standalone HTML、Claude Code handoff を提供する。
  - Claude Design の Design System は、codebase、slide deck / document、brand guideline assets などから colors、typography、components、layout patterns を抽出して organization に保持する。
  - Claude Design には Claude Code との導線があり、`/design-sync` で design system を取り込む運用が案内されている。
  - 公式 docs は export format の一覧と handoff 導線を説明しているが、Design System export または handoff bundle の安定した file schema は公開していない。
  - repo 内には Claude Design handoff bundle、standalone HTML export、zip export のサンプルが存在しない。
- **含意**:
  - 現時点で `design-contract.md`、bundled default Design Profile、deck-local manual override を前提に tasks へ進むべきではない。
  - 次の設計改訂では、user-facing input を Claude Design export / handoff bundle に絞り、Design Contract は importer が生成する normalized internal artifact として扱う。
  - importer の Interface は、実サンプルから安定して読める最小情報に限定する。候補は colors、typography、spacing / density、layout patterns、component names、asset paths、responsive hints、source fingerprint である。
  - PDF / PPTX は visual QA の補助には使えるが、primary import source にはしない。standalone HTML / zip / Claude Code handoff bundle を優先して観察する。
- **未確定点**:
  - Claude Code handoff bundle の top-level file 一覧、machine-readable spec の有無、tokens / components / assets の path。
  - standalone HTML export の CSS token 抽出可能性、inline style の比率、asset path の安定性。
  - `.zip` export が standalone HTML と同じ内容なのか、project metadata や design intent を含むのか。
  - `/design-sync` が repo 内にどの file を生成または更新するのか。
- **実サンプル取得条件**:
  - 同じ Claude Design project から `Handoff to Claude Code`、`Export as standalone HTML`、`Download as .zip` を取得する。
  - 可能なら Design System あり / なしの 2 project を比較する。
  - export files は `fixtures/claude-design-export-discovery/<case>/` など repo 内の一時検証場所に置き、個人情報や非公開ブランド asset を含む場合は tracked file にしない。

### Claude Design export sample: DDD Lecture Design System.zip

- **背景**: 正式版の `DDD Lecture Design System.zip` をローカルで確認し、Claude Design Source の実 file set と manifest shape を観察した。この sample は DDD 講義向けだが、workflow 契約は DDD 固定ではなく任意の Design System を受け付ける前提にする。
- **参照した情報源**:
  - local file `/Users/j5ik2o/Downloads/DDD Lecture Design System.zip`
- **file tree**:
  - `.thumbnail` - WebP thumbnail。
  - `_ds_manifest.json` - Design System manifest。namespace、global CSS paths、tokens、brand fonts、component/card/template arrays を持つ。
  - `SKILL.md` - Design System の使い方を示す primary guidance。
  - `readme.md` - audience、tone、copy、visual language、component usage などの詳細 guidance。
  - `_ds_bundle.js` - `@ds-bundle` comment を持つ JavaScript bundle。
  - `_adherence.oxlintrc.json` - token adherence 用の lint rule と `x-omelette` metadata。
  - `styles.css` - `tokens/*.css` を import する global entry point。
  - `tokens/colors.css`、`tokens/fonts.css`、`tokens/spacing.css`、`tokens/typography.css` - CSS custom properties と font import。
  - `components/**/*.jsx`、`components/**/*.d.ts`、`components/**/*.prompt.md`、`components/**/*.card.html` - reusable component と usage prompt。
  - `guidelines/*.card.html` - Design System の foundation specimen。
  - `slides/*.html` - sample slide types。
  - `templates/**/*.dc.html`、support scripts - deck template。
  - `assets/*` - brand / design assets。
- **発見**:
  - manifest の `namespace` は `DDDLectureDesignSystem_a0d171`、`source` は `spa`。
  - manifest の `globalCssPaths` は `tokens/fonts.css`、`tokens/colors.css`、`tokens/typography.css`、`tokens/spacing.css`、`styles.css`。
  - manifest token は 119 件。importer 分類では color 56、typography 31、spacing 23、radius 5、shadow 4、other 0。
  - token 定義元は `tokens/colors.css` 56 件、`tokens/typography.css` 31 件、`tokens/spacing.css` 32 件。
  - `brandFonts` は `{ family, status }` の object 配列で、`Noto Serif JP`、`Noto Sans JP`、`JetBrains Mono` の 3 件があり、いずれも `status: "ok"`。
  - `components` は 6 件、`cards` は 20 件、`templates` は 1 件。`startingPoints`、`themes`、`fonts` は空配列。
  - `_adherence.oxlintrc.json` の `x-omelette.tokens` も 119 件で manifest と一致する。
  - adherence rules は raw hex color、raw px value、未提供 font-family を warning する。これは review / lint surface に使える。
  - `styles.css` は import entry のみで inline rule を持たない。実際の contract source は manifest と `tokens/*.css` である。
- **含意**:
  - 初期 importer は `Claude Design Source` を zip file として受け取り、必須 file を `_ds_manifest.json`、`styles.css`、`tokens/colors.css`、`tokens/typography.css`、`tokens/spacing.css` として検証できる。
  - `tokens/fonts.css` は font import の source として扱うが、network font availability は workflow 成功条件にしない。`brandFonts` が string 配列でも object 配列でも family を抽出し、font token と合わせて `brand_fonts` を report すればよい。
  - `SKILL.md`、`readme.md`、component prompt、cards、sample slides、templates は plan / compose が Design System の意図を読むための primary guidance / source catalog として使える。
  - ただし sample は DDD 講義向けなので、workflow に DDD 専用 component 名や語彙を固定してはならない。importer は generic catalog として保持し、facet は brief に合う要素だけを選定する。
  - `components` が空でも valid な Claude Design Source として扱う。非空の場合は component import を必須条件にせず、汎用 catalog として扱う。
  - importer は manifest token と CSS token の一致、`x-omelette.tokens` との一致、`globalCssPaths` の存在、source fingerprint を validation surface にする。
  - `kind` の分類には注意が必要である。sample では `--text-*` が `font`、`--fs-*` が `spacing` と分類されており、semantic category と CSS property category が一致しない場合がある。importer は token name prefix と CSS file path も併用して分類する。
- **暫定 importer contract**:
  - Accepted source: `.zip` archive containing `_ds_manifest.json`.
  - Required files: `_ds_manifest.json`, `styles.css`, `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`.
  - Optional files: `.thumbnail`, `_ds_bundle.js`, `_adherence.oxlintrc.json`, `tokens/fonts.css`, `SKILL.md`, `readme.md` / `README.md`, `components/**/*.prompt.md`, `guidelines/*.card.html`, `slides/*.html`, `templates/**/*.dc.html`, `assets/*`.
  - Required manifest fields: `namespace`, `globalCssPaths`, `tokens`.
  - Optional manifest fields: `components`, `startingPoints`, `cards`, `templates`, `themes`, `fonts`, `brandFonts`, `source`.
  - Failure cases: missing manifest, malformed JSON, JSON object ではない manifest、required manifest field の型不一致、missing required token CSS file、empty token list、manifest/CSS token name/value mismatch、unreadable zip、valid zip と invalid sibling zip の同居。
  - Report fields: namespace, source, source fingerprint、contract fingerprint、global CSS paths、required files、optional files present、token counts、brand fonts、component count/name summary、adherence availability、guidance documents、component prompts、source catalog counts。

### 実装 close-out: PR review 後の hardening

- **背景**: Claude Design Source import 実装後のPR reviewで、実運用時に古い Design System を誤採用したり、`--force` 時に古い成果物と新しい Resolved Design Contract が混在したりする failure mode が見つかった。
- **参照した情報源**:
  - `scripts/lib/takt-marp-claude-design-source.mjs`
  - `scripts/takt-marp-run-slide-workflow.mjs`
  - `scripts/takt-marp-validate-slide-workflow-foundation.mjs`
  - `.takt/facets/instructions/takt-marp-polish-inspect.md`
  - `.takt/facets/instructions/takt-marp-polish-fix.md`
- **発見**:
  - `slides/<deck>/design/` に valid zip と invalid zip が同居する場合、valid zip を暗黙採用すると壊れた新規 export を無視して古い Design System で進んでしまう。最終実装では invalid sibling zip が 1 件でもあれば `CLAUDE_DESIGN_SOURCE_INVALID` として停止する。
  - `_ds_manifest.json` が JSON としては valid でも `null`、文字列、配列の場合、field access ではなく `CLAUDE_DESIGN_SOURCE_INVALID` として扱う必要がある。
  - `plan` / `compose --force` では、source validation は archive / clean 前に必要だが、Resolved Design Contract の保存まで先に行うと archive / clean 失敗時に旧成果物と新契約が混在する。最終実装では import / validation と保存を分け、保存は archive / clean 成功後に遅延する。
  - `plan` / `compose` を rejected supervision から `--force` なしで再実行する場合も、source validation が rejected artifact archive より後だと、TAKT を起動できない失敗なのに review / supervision sidecar だけが history へ移動する。最終実装では rejected archive 前に import / validation を済ませる。
  - `polish`、`deliver`、`research` は新しい Design Contract を生成しないため、既存 marker が malformed の場合は読み捨て、保存済み Resolved Design Contract marker または `null` にフォールバックして新しい marker を書く必要がある。
  - 既存 marker の target が一致しても `design_contract.path` が存在しない場合、その marker を引き継ぐと存在しない Resolved Design Contract を facet に渡してしまう。最終実装では stale marker として扱い、保存済み Resolved Design Contract がなければ `design_contract` を持たない marker を書く。
  - 既存 marker の target が一致し `design_contract.path` が存在しても、その path の Resolved Design Contract が malformed JSON または marker payload を作れない shape の場合、既存 marker の `design_contract` を引き継ぐと通常 polish path として壊れた contract を facet に渡してしまう。最終実装では path existence だけでなく contract shape を読み直して検証する。
  - `fingerprint` が object でも `fingerprint.contract_sha256` と `fingerprint.source_sha256` が欠けている場合、compose / polish の照合に使える marker payload ではない。最終実装では `source.path`、`source.sha256`、`source.namespace`、`fingerprint.source_sha256`、`fingerprint.contract_sha256` を必須 field として扱う。
  - 保存済み Resolved Design Contract 自体が malformed JSON または marker payload を作れない shape の場合も、`polish` / `deliver` を中断するより、`design_contract` を省略して legacy path へフォールバックする方が既存 deck の移行安全性に合う。
  - Claude Design Source 導入前に compose 済みの既存 deck には Resolved Design Contract がない。`polish-inspect` / `polish-fix` は Design Contract 不在そのものを blocked にせず、render evidence と既存 source artifact の範囲で legacy visual/layout/render 修正を許可する。
  - ただし marker に `design_contract.path` がある通常 polish path では、Legacy Polish Path の skip 規則を適用してはならない。`polish-inspect` / `polish-fix` は Resolved Design Contract を読み、marker と contract の `fingerprint.contract_sha256`、token constraints、brand fonts、adherence metadata、`guidance`、`source_catalog` に対する drift を finding として扱う必要がある。
- **含意**:
  - Claude Design Source resolver は「valid が 1 件あるか」ではなく「design directory 全体が exactly one valid source として整理されているか」を検証する。
  - Resolved Design Contract は workflow-managed artifact だが、`--force` invalidation が成功するまで旧成果物と整合する旧 contract を保つ。
  - `polish` の migration path は `plan` / `compose` の migration path と異なる。`plan` / `compose` は Claude Design Source 必須、`polish` は既存 deck を壊さないため Design Contract なし legacy path を許可する。ただし Resolved Design Contract がある deck では通常 path として drift 検査を行う。
- **追加 validation**:
  - invalid sibling zip で runner が TAKT を起動しない。
  - manifest `null` で importer が `CLAUDE_DESIGN_SOURCE_INVALID` を返す。
  - object 形式の `brandFonts` から `family` を抽出して `brand_fonts` に保持する。
  - `--force` archive 失敗時に新しい Resolved Design Contract を保存しない。
  - rejected rerun で missing Claude Design Source の場合に supervision / review history を変更しない。
  - malformed marker から `polish` marker が保存済み Resolved Design Contract を復旧する。
  - `design_contract.path` が存在しない stale marker を `polish` marker に引き継がない。
  - corrupt な保存済み Resolved Design Contract を `polish` marker に引き継がない。
  - 既存 marker が intact でも、`design_contract.path` が指す Resolved Design Contract が corrupt な場合は `polish` marker に引き継がない。
  - `fingerprint.contract_sha256` / `fingerprint.source_sha256` が欠けた Resolved Design Contract を `polish` marker に引き継がない。
  - `polish-inspect` 文言が `design_contract.path` のある通常 path で `fingerprint.contract_sha256` と token drift を確認し、Legacy Polish Path を Design Contract 不在時だけに限定する。

## アーキテクチャパターン評価

| 選択肢 | 説明 | 強み | リスク／制約 | 判断 |
|--------|------|------|--------------|------|
| compose が毎回 `design-system.md` を生成 | 現行形を維持し、文書名だけ整理する | 実装差分が小さい | 再利用可能な Design Contract にならず、ユーザー要求に反する | 不採用 |
| top-level `design` command を追加 | Design Contract 作成・承認を独立 command にする | 操作上は分かりやすい | ADR 0001 の command surface と要件 5 に反する | 不採用 |
| runner が Design Contract を解決し marker で渡す | package-bundled default と deck-local override を runner で解決する | no-copy、既存 command、既存 marker と整合する | 利用者が Markdown Design Contract を評価・編集する前提が残る | 旧案。Claude Design Source 方針で破棄予定 |
| plan だけが Design Contract を読む | `plan` の layout / visual を制約する | plan 品質は上がる | `compose` の CSS / `_class` とのズレを防げない | 不採用 |
| compose だけが Design Contract を読む | CSS 生成側だけを制約する | compose 差分は小さい | `plan` が実現不能な layout / visual を出し続ける | 不採用 |
| Claude Design export を唯一の user-facing design source にする | Claude Design zip / handoff / HTML を importer が読み、Resolved Design Contract に正規化する | 利用者がテキスト Design Contract を評価・編集しなくてよい。Interface が小さくなる。Design System ごとの差分を guidance / source catalog として扱える | zip schema が変わる可能性があるため importer seam に閉じる必要がある | 採用。importer は token bundle だけでなく guidance / source catalog も Resolved Design Contract に取り込む |

## 設計判断

### 旧判断: Design Contract は full-file override として解決する

- **背景**: deck-local `design-contract.md` を default profile にどう重ねるかを決める必要がある。
- **検討した代替案**:
  1. partial merge - deck-local file の一部だけ default に上書きする。
  2. full-file override - deck-local file があればその file 全体を Resolved Design Contract とする。
- **採用したアプローチ**: 初期 scope では full-file override を採用する。
- **根拠**: Markdown contract の partial merge は見た目に分かりにくく、AI worker の解釈差を生みやすい。full-file override は利用者が読んだ file と workflow が使う契約が一致する。
- **トレードオフ**: deck-local override は default の全セクションを持つ必要がある。将来 partial override が必要になった場合は別 spec で contract format を拡張する。
- **現在の扱い**: Claude Design Source を唯一の user-facing design system 入力にする方針で破棄予定。実サンプル discovery 後に requirements / design から bundled default と deck-local override を除く。

### 判断: `plan` 成果物に Design Contract fingerprint を記録する

- **背景**: `plan` 実行後に `design-contract.md` が変更されると、`compose` が同じ契約を読んだとは言えなくなる。
- **検討した代替案**:
  1. 実行時に毎回 current contract を読むだけにする。
  2. `plan.md` と `slide-blueprint.md` に contract source と fingerprint を記録し、`compose` で照合する。
- **採用したアプローチ**: `plan` は contract metadata を記録し、`compose` は marker の fingerprint と照合する。
- **根拠**: 要件 3.1 の「同じ Resolved Design Contract」を機械的に検証できる。
- **トレードオフ**: contract 変更後は re-plan または plan metadata 更新が必要になる。
- **フォローアップ**: compose review は fingerprint mismatch を blocker finding として扱う。

### 旧判断: packaged domain と ejectable domain を分離する

- **背景**: Design Profile は package に含める必要があるが、`eject` の user-facing 契約は `.takt/workflows` と `.takt/facets` のコピーである。
- **検討した代替案**:
  1. `TEMPLATE_DOMAINS` に `design-profiles` を追加し、eject でも `.takt/design-profiles` をコピーする。
  2. package/drift 用 domain と eject 用 domain を分離する。
- **採用したアプローチ**: `PACKAGED_TEMPLATE_DOMAINS = ["workflows", "facets", "design-profiles"]` と `EJECTABLE_TEMPLATE_DOMAINS = ["workflows", "facets"]` を分ける。
- **根拠**: package には bundled default を含めながら、通常実行と eject の既存操作感を維持できる。
- **トレードオフ**: template utility の引数が増える。
- **現在の扱い**: Claude Design Source を唯一の user-facing design system 入力にする方針では bundled default Design Profile を配布しないため、`design-profiles` domain 追加は破棄予定。

### 判断: Claude Design Source を唯一の user-facing design system 入力にする

- **背景**: 利用者はデザインシステムを Markdown file として評価・編集するのではなく、Claude Design の Design System を primary にしたい。
- **検討した代替案**:
  1. Markdown `design-contract.md` と bundled default Design Profile を残す。
  2. Claude Design export を唯一の user-facing design source とし、Design Contract は internal normalized artifact にする。
- **採用したアプローチ**: 案 2。`plan` / `compose` は Claude Design export が存在しない場合に明確に失敗し、default fallback や manual `design-contract.md` override は初期 scope から外す。
- **根拠**: Interface が小さくなり、ユーザーがテキストだけでデザイン品質を判断する問題を避けられる。
- **トレードオフ**: Claude Design export format への依存が強くなる。export schema が未公開のため、実サンプル観察に基づく importer validation が必要になる。
- **フォローアップ**: sample 1 の構造をもとに requirements / design を改訂する。layout vocabulary / visual component を Claude Design zip から必須取得する設計にはしない。改訂前に tasks を生成しない。

## リスクと緩和策

- **既存 facet に残る `design-system.md` 参照** - implementation tasks で `templates/project` と `.takt` の両方を更新し、template drift check で同期漏れを検出する。
- **contract 変更後の compose drift** - fingerprint を plan artifact と marker に記録し、compose と review で一致を確認する。
- **旧案の package-bundled default が pack に含まれない** - Claude Design Source 方針では bundled default Design Profile を配布しないため、このリスクは requirements / design 改訂時に削除する。
- **既存 deck の legacy `design-system.md` が誤って正本扱いされる** - review/fix/foundation の文言から成功条件・override 条件としての参照を削除する。
- **旧案の Design Contract Markdown が曖昧になる** - Claude Design Source 方針では手書き Markdown を user-facing 入力にしないため、このリスクは importer validation の問題として扱い直す。
- **Claude Design export schema が未公開** - 実サンプル discovery を先行し、importer は file tree / required files / extracted fields を validation する。schema が変わった場合は明確に失敗し、fallback で曖昧に続行しない。
- **Claude Design への依存が強くなる** - user-facing design source を Claude Design に絞る代わりに、Resolved Design Contract を internal artifact として保持し、plan / compose / review の downstream contract は安定化する。

## 参考資料

- `CONTEXT.md` - Claude Design Source / Design Contract / Resolved Design Contract の用語定義。
- `docs/adr/0001-slide-workflow-command-model.md` - command surface と approval 所有権の制約。
- `docs/adr/0003-design-contract-as-reusable-slide-style-input.md` - Design Contract を再利用可能な workflow 入力にする判断。
- `.kiro/specs/slide-workflow-design-contract/requirements.md` - 本設計の要求仕様。
- `docs/marp-slide-workflow.md` - 現行 workflow 契約と変更対象。
- [Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design) - Claude Design の export format、Claude Code handoff、`/design-sync` 導線。
- [Set up your design system in Claude Design](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design) - Design System の source material、抽出対象、publish / update 運用。
- [Introducing Claude Design by Anthropic Labs](https://www.anthropic.com/news/claude-design-anthropic-labs) - Claude Design の design system / export / Claude Code handoff の公式紹介。
