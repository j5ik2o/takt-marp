# takt-marp

takt-marp の slide workflow と command artifact 境界で使う用語集。

## Language

**Command Config Registry（コマンド設定レジストリ）**:
slide workflow の各 command について、state、artifact domain、approval、invalidation scope を一元的に定義する command behavior の正本。
_Avoid_: command list, scattered command metadata, per-command if branches

**Workflow Runner（ワークフローランナー）**:
user-facing command を検証し、target marker、workflow selection、TAKT 起動、artifact sync を接続する実行境界。
_Avoid_: CLI command, TAKT workflow, shell wrapper

**Workflow Handoff Marker（ワークフロー引き渡しマーカー）**:
Workflow Runner が command target と command 固有 metadata を workflow/facets へ渡す workspace-local state。research と design の metadata は同じ marker に載せても別 field として扱う。
_Avoid_: temp config, global state, hidden input, report artifact

**Template Distribution（テンプレート配布）**:
package-bundled template と ejected project template の両方で同じ slide workflow assets を利用可能にする配布境界。
_Avoid_: template copy script, local template fork, package assets only

**Validation Surface（検証面）**:
slide workflow の command/state/artifact/template smoke behavior を deterministic に固定する検証境界。
_Avoid_: ad hoc test script, manual QA, CI only

**Research Handoff Contract（調査引き渡し契約）**:
user-facing deck target と TAKT research brief target を分け、runner から workflow/facets へ渡す target metadata の契約。
_Avoid_: implicit target, target guess, task path as deck target

**Research Source Report Locator（調査元レポート特定子）**:
TAKT run reports から built-in deep research の正本 `research-report.md` を一意に選ぶ探索規則。
_Avoid_: report grep, arbitrary report selection, adapter report

**Research Source Report Reuse（調査元レポート再利用）**:
deep research が生成した built-in `research-report.md` を、後続 step の失敗後に再利用して、同じ調査を再実行せずに research workflow を継続すること。
_Avoid_: TAKT resume, full rerun, report cache

**Research Reuse Sidecar（調査再利用サイドカー）**:
Research Source Report Reuse の安全判定に必要な target、research brief hash、source report path を `.takt/` 配下に保存する実行状態。
_Avoid_: deck artifact, report artifact, TAKT meta

**Workflow Identity（ワークフロー識別子）**:
TAKT run metadata の workflow 値を、workflow 名と workflow file path の違いに依存せず同じ workflow として比較するための正規化済み識別値。
_Avoid_: raw workflow path, raw meta workflow, display name

**Research Workflow Selection Contract（調査ワークフロー選択契約）**:
public `research` command の full research workflow と、private reuse workflow を同じ template source から選ぶための契約。
_Avoid_: research-reuse command, ad hoc workflow path, workflow alias

**Research Workflow Wrapper（調査ワークフローラッパー）**:
TAKT built-in `deep-research` を呼び、repo-local では adapter と supervision への接続だけを所有する full research workflow。
_Avoid_: deep research fork, repo-local research engine, copied built-in facets

**Research Reuse Workflow（調査再利用ワークフロー）**:
Research Reuse Sidecar が有効なときに、deep research を再実行せず adapter と supervision だけを実行する private workflow。
_Avoid_: full research workflow, TAKT resume, public reuse command

**Research Adapter（調査アダプター）**:
built-in `research-report.md` を deck-local research artifacts へ写像する workflow 境界。
_Avoid_: additional researcher, report evaluator, source report replacement

**Research Artifact Sync（調査成果物同期）**:
TAKT run reports と workflow outputs を deck-local `research/` domain へ同期する実行境界。
_Avoid_: review artifact sync, plan artifact sync, global report copy

**Research Supervision Validator（調査監督検証）**:
`research-supervision.md` が `research` command の successful state を表すことを検証する CLI 境界。
_Avoid_: review validator, human approval, report formatter

**Plan Optional Context（plan任意文脈）**:
`plan` が `brief.md` を primary input として維持しながら、存在する research artifacts だけを補助文脈として読む扱い。
_Avoid_: research prerequisite, mandatory research, plan input replacement

**Design Brief（デザインブリーフ）**:
Claude Design に Design System 作成を依頼するための deck-local authoring input。`brief.md` の資料要求と brand / audience / style constraints を Claude Design 向けに整え、Claude Design Source の生成意図を固定する。
_Avoid_: plan.md as design input, ad hoc design prompt, generated design-system.md

**Claude Design Source（Claude Designソース）**:
Claude Design から export または handoff された、slide workflow が受け付ける唯一の user-facing design system 入力。deck ごとに異なる Design System が来る前提で扱い、固定ドメインや固定 component 語彙を仮定しない。
_Avoid_: manual design-contract.md, bundled design profile, generated design-system.md

**Design Contract（デザイン契約）**:
Claude Design Source を workflow が読める形に正規化した内部契約。layout vocabulary、visual component、CSS token、review 可能な style 制約に加え、Design System Guidance と Source Catalog を汎用構造として定義する。
_Avoid_: user-authored design input, per-deck generated design system, ad hoc CSS template, style notes

**Resolved Design Contract（解決済みデザイン契約）**:
Claude Design Source を取り込み、source metadata、fingerprint、token、Design System Guidance、Source Catalog を付与した workflow 実行時の Design Contract。`plan` と `compose` が同じ design input を参照したことを検証するための snapshot である。
_Avoid_: generated design-system.md, compose-local style decision, implicit design

**Design System Guidance（デザインシステムガイダンス）**:
Claude Design Source に含まれる `SKILL.md`、`readme.md`、component prompt などの deck 固有の使用指針。workflow はこれを固定ルールに昇格せず、該当 deck の Design Contract 入力として扱う。
_Avoid_: global instructions, fixed component rules, generated design-system.md

**Source Catalog（ソースカタログ）**:
Claude Design Source に含まれる components、starting points、cards、templates、sample slides、guidelines、themes、fonts、assets を、特定ドメイン名に固定せず列挙する Design Contract 内の再利用候補一覧。templates は manifest entries だけでなく `templates/**/*.dc.html` archive entries からも検出する。
_Avoid_: built-in component list, required component set, domain-specific catalog

**Legacy Polish Path（レガシーpolish経路）**:
Claude Design Source 導入前に compose 済みで Resolved Design Contract を持たない deck を、render evidence と既存 source artifact の範囲で polish する移行経路。
_Avoid_: implicit design migration, plan/compose fallback, design-system.md fallback
