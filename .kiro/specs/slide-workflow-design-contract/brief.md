# Brief: slide-workflow-design-contract

## Problem

workflow 利用者は、資料ごとに `design-system.md` を作り直したくない。一方で、手書き Markdown の Design Contract を読んでデザイン品質を判断する前提も重い。デザインシステムは資料生成時の一時成果物ではなく、Claude Design で作られた視覚仕様を primary source として取り込むべきである。

現状の `compose` は `design_system` step から始まり、`slides/<deck>/design-system.md` を canonical source artifact として生成・参照する。このままだと、`plan` が選ぶ `Layout` / `Visual` と `compose` が生成する CSS / `_class` / HTML visual component の接続が、毎回の生成品質に依存する。

## Current State

- `plan` は `brief.normalized.md`、`reference-analysis.md`、`plan.md`、`slide-blueprint.md` を生成する。
- `plan` は CSS を生成しないが、`Layout`、`Visual`、`Visual Strategy` を後続 `compose` への設計指示として出す。
- `compose` は `design_system` step から始まり、`slides/<deck>/design-system.md` を作成または更新する。
- `assemble_slides` は `design-system.md` を読み、`SLIDES.md` の front matter CSS を構成する。
- `compose-review` は `plan` の `Layout` と `SLIDES.md` の `_class:` / style 定義 / `design-system.md` 文書化を照合する。
- package-bundled workflow/facet template は no-copy contract により、通常実行では consumer workspace へコピーしない。
- Claude Design export zip は `_ds_manifest.json`、`styles.css`、`tokens/*.css`、`_adherence.oxlintrc.json` に加え、`SKILL.md`、`readme.md`、component prompts、cards、sample slides、templates、assets を含む場合がある。Design System ごとに要素は異なるため、特定ドメインや特定 component 名を固定してはならない。

## Desired Outcome

- Claude Design Source（Claude Designソース）を唯一の user-facing design system 入力として扱う。
- 利用者は `slides/<deck>/design/` に Claude Design から export した `.zip` を置くだけで、`plan` / `compose` が同じ Resolved Design Contract（解決済みデザイン契約）を参照できる。
- Design Contract（デザイン契約）は手書き入力ではなく、Claude Design Source から importer が生成する internal normalized artifact とする。
- `plan` は Resolved Design Contract の source metadata、fingerprint、token summary、style constraints、guidance、source catalog を記録するが、CSS は生成しない。
- `compose` は `plan` が参照した Resolved Design Contract と fingerprint を照合し、その契約から `SLIDES.md` front matter CSS、`_class`、section HTML/CSS、必要な visual source を生成する。
- `design-system.md` は compose の canonical source artifact、override 条件、成功条件から外す。
- review / smoke validation は Claude Design Source の import、Resolved Design Contract の記録、plan / compose の fingerprint 一致、CSS token 適用、no-copy 維持を検証する。

## Approach

Claude Design Source の初期対応範囲は、`_ds_manifest.json` を含む `.zip` export に絞る。runner は `plan` / `compose` 実行前に `slides/<deck>/design/` から Claude Design zip を 1 件だけ解決し、manifest と token CSS を検証して Resolved Design Contract を `.takt/` 配下へ生成する。

`plan` は marker 経由で Resolved Design Contract を読み、CSS を出さずに layout / visual / density の制約として使う。`components`、cards、templates、sample slides、component prompts が存在する場合は brief に合うものだけを選定し、存在しない場合でも token constraints と既存 slide workflow の layout vocabulary で計画を継続する。

`compose` は `plan` metadata と現在の Resolved Design Contract の fingerprint を照合し、一致した場合だけ CSS / `_class` / section source を生成する。不一致の場合は、古い plan で新しい design source を使った可能性を明示して失敗または blocker finding にする。

この approach は、新しい top-level `design` command を追加せず、既存 ADR の `plan / compose / polish / deliver` command surface を維持する。通常実行で consumer workspace へ `.takt/workflows` / `.takt/facets` をコピーしない no-copy contract とも整合する。

## Scope

**In**:

- Claude Design zip を唯一の user-facing design system 入力として解決する規則。
- `slides/<deck>/design/` の zip discovery、missing / ambiguous / invalid source の失敗規則。
- `_ds_manifest.json`、`styles.css`、`tokens/colors.css`、`tokens/typography.css`、`tokens/spacing.css` の検証。
- optional な `.thumbnail`、`_ds_bundle.js`、`_adherence.oxlintrc.json`、`tokens/fonts.css`、`SKILL.md`、`readme.md`、component prompts、cards、sample slides、templates、assets の取り込み。
- Resolved Design Contract として、colors / typography / spacing / radius / shadow / brand fonts / adherence metadata / guidance / source catalog を正規化する。
- `components` が空でも valid な Claude Design Source として扱い、非空の場合は汎用 catalog として扱う。
- `plan` が Resolved Design Contract を参照して、CSS を生成せず source metadata と制約を記録する規約。
- `compose` が Resolved Design Contract から CSS / `_class` / section HTML/CSS を生成する規約。
- `design-system.md` を compose canonical artifact、override 条件、success assertion から外す workflow / docs / validator 更新。
- compose report / review / supervision reports への Claude Design Source 使用記録。
- smoke validation、foundation validation、package/no-copy validation の更新。

**Out**:

- 新しい top-level `design` command。
- Claude Design Source 以外の manual `design-contract.md` 入力。
- package 側の default design input。
- deck-local Markdown override。
- PDF / PPTX / standalone HTML export の primary import 対応。
- Claude Design `/design-sync` の repo 更新形式への対応。
- visual render review の multimodal 化。
- 既存 deck の全面デザイン移行。
- consumer workspace への `.takt/workflows` / `.takt/facets` 自動コピー。
- `plan` による CSS 生成。

## Boundary Candidates

- **Claude Design Source Resolution**: target deck の `slides/<deck>/design/` から Claude Design zip を一意に解決し、source path と fingerprint を決める責務。
- **Claude Design Import**: zip 内の manifest / token CSS / adherence metadata を検証し、workflow-facing な Design Contract へ正規化する責務。
- **Resolved Design Contract Handoff**: runner が Resolved Design Contract の path、fingerprint、summary を `.takt/workflow-current-target.json` へ記録し、`plan` / `compose` / review へ渡す責務。
- **Planning With Design Contract**: `plan` が CSS を生成せず、Resolved Design Contract の token constraints と既存 layout vocabulary から実現可能な `Layout` / `Visual` を選ぶ責務。
- **Composition From Design Contract**: `compose` が Resolved Design Contract を `SLIDES.md` CSS、`_class`、section HTML/CSS、visual source へ写像する責務。
- **Design Contract Review**: `compose-review` と smoke validation が、`plan` / `SLIDES.md` / CSS / visual component が同じ Resolved Design Contract に従っていることを照合する責務。

## Out of Boundary

- `design` command や `design:approve` の追加。
- Design Contract を生成 AI が user-facing Markdown として毎回新規作成する flow。
- Claude Design Source を `CONTEXT.md` や ADR に実装詳細として保存すること。
- `.takt/facets` / `.takt/workflows` を通常実行で consumer workspace へ配置すること。
- legacy `design-system.md` を Claude Design Source として解釈すること。
- `polish` の visual review 強化。これは `slide-workflow-visual-review` の責務。

## Upstream / Downstream

**Upstream**:

- `slide-workflow-foundation`: command/state/report/approval foundation。
- `slide-workflow-orchestration`: `plan` / `compose` workflow structure。
- `slide-workflow-quality-uplift`: layout vocabulary、visual component、review severity の品質基準。
- `takt-marp-global-installer`: package-bundled template / no-copy / eject-only distribution contract。

**Downstream**:

- `slide-workflow-visual-review`: Resolved Design Contract の token / style rule を render review の判定基準として使える。
- future Claude Design import: HTML / handoff bundle / `/design-sync` 対応を追加できる。
- smoke validation: `design-system.md` existence ではなく Claude Design Source import と CSS token application を検証する。

## Existing Spec Touchpoints

**Extends**:

- `slide-workflow-orchestration`: `compose` workflow の先頭 step と canonical artifacts を更新する。
- `slide-workflow-quality-uplift`: layout vocabulary / visual component / review 観点を token constraints へ接続する。
- `takt-marp-global-installer`: no-copy validation と package boundary validation を更新する。
- `slide-workflow-smoke-validation`: compose artifact assertion と mock compose artifact を更新する。

**Adjacent**:

- `slide-workflow-visual-review`: render evidence cycle の視覚判定強化は隣接だが、この spec では扱わない。
- `slide-workflow-research`: research artifacts は plan optional context のままで、Claude Design Source の入力にはしない。

## Constraints

- `.kiro/specs/**/*.md` は日本語で書く。
- user-facing design system 入力は Claude Design Source だけにする。
- `plan` は CSS、front matter style、`_class` style 定義を生成しない。
- `compose` は `design-system.md` を canonical source artifact として生成または要求しない。
- `design-system.md` が存在しても、Claude Design Source、override、成功条件として扱わない。
- 通常実行で consumer workspace へ `.takt/workflows` / `.takt/facets` をコピーしない。
- `components` が空の Claude Design zip を valid として扱う。
- Claude Design export schema が変わった場合は曖昧に fallback せず、原因が分かる失敗として扱う。
