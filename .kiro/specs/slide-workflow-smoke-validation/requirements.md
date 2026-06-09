# 要件ドキュメント

## 概要

`slide-workflow-smoke-validation` は、`slide-workflow-foundation` と `slide-workflow-orchestration` が定めた Marp slide workflow の契約を、smoke deck の実行で end-to-end に検証する spec です。

現在は再設計後の canonical sequence が定義されている一方で、target validation、approval gate、report front matter、loop monitor routing、render evidence、delivery artifact の契約が全体 sequence で噛み合うことはまだ証明されていません。この spec では新しい command/state model や workflow semantics を導入せず、smoke deck を通じて invalid target、approval、render evidence、deliver artifact、rerun/force/history の実挙動を確認し、発見した integration issue を最小限に収束させます。

## 境界コンテキスト

- **対象**: smoke deck 準備、canonical command sequence の実行検証、invalid target と preflight failure の検証、approval flow の検証、render evidence の検証、delivery artifact の検証、rerun/force/history の検証、smoke で見つかった integration issue の最小修正
- **対象外**: command/state model の再設計、旧 command 互換 alias、approval ownership 変更、`html`/`pdf`/`pptx` 以外の deliverable 追加、PPTX visual inspection の `polish` 組み込み、GitHub PR automation
- **隣接する期待**: foundation は deterministic scripts、runner preflight、approval、render evidence foundation を提供し、orchestration は canonical 4 workflow と report contract を提供する。この spec はそれらの契約を実行で検証し、矛盾が見つかった場合は upstream feedback として扱う。

## 要件

### 要件 1: smoke deck を canonical target contract に合わせて準備する

**目的:** メンテナとして、既存 fixture を再設計後 workflow の代表入力として使いたい。そうすることで、旧 `brief.md` target や旧 workflow 名に依存した smoke が残ることを防げる。

#### 受け入れ条件

1.1. When smoke deck を準備する場合, the slide workflow smoke validation shall fixture から `slides/<deck>/brief.md` を持つ検証用 deck directory を再現できる。

1.2. When smoke 実行手順を確認する場合, the slide workflow smoke validation shall command target として `slides/<deck>` を使い、`slides/<deck>/brief.md` を command target として案内しない。

1.3. The slide workflow smoke validation shall smoke deck の source artifact と generated evidence/artifact を区別して扱う。

### 要件 2: canonical command sequence が delivered まで到達することを検証する

**目的:** メンテナとして、`plan / compose / polish / deliver` が個別ではなく sequence として接続できることを確認したい。

#### 受け入れ条件

2.1. When smoke sequence を実行する場合, the slide workflow smoke validation shall `slide:plan`、`slide:approve plan`、`slide:compose`、`slide:approve compose`、`slide:polish`、`slide:deliver` の順に検証できる。

2.2. When canonical sequence が成功する場合, the slide workflow smoke validation shall final state が `delivered` に到達したことを supervision report と delivery artifact から確認できる。

2.3. If sequence 内の command が失敗する場合, the slide workflow smoke validation shall 失敗した command、期待された prerequisite、参照すべき report または artifact path を示す検証結果を残す。

### 要件 3: invalid target と preflight failure を TAKT 起動前に検証する

**目的:** メンテナとして、誤った target や missing approval が workflow 実行に入る前に止まることを確認したい。

#### 受け入れ条件

3.1. If 利用者が `slides/<deck>/brief.md`、任意の Markdown file、または `slides/` 外 path を command target にする場合, the slide workflow smoke validation shall TAKT が起動しないことを検証できる。

3.2. If `compose` に必要な plan approval が存在しない場合, the slide workflow smoke validation shall `compose` が TAKT 起動前に失敗することを検証できる。

3.3. If `polish` に必要な compose approval が存在しない場合, the slide workflow smoke validation shall `polish` が TAKT 起動前に失敗することを検証できる。

3.4. When preflight failure を検証する場合, the slide workflow smoke validation shall failure が stale report の存在だけで成功扱いされないことを確認できる。

3.5. When approval state を検証する場合, the slide workflow smoke validation shall approval の `supervision_workflow_run_id` が canonical passed supervision の `workflow_run_id` と一致しない stale approval が TAKT 起動前に拒否されることを確認できる。

### 要件 4: approval flow が人間コマンドだけで進むことを検証する

**目的:** メンテナとして、approval file が TAKT agent の生成物ではなく明示的な人間コマンドの記録であることを確認したい。

#### 受け入れ条件

4.1. When `slide:approve` を `plan` または `compose` に対して `--by` 付きで実行する場合, the slide workflow smoke validation shall matching passed supervision に対して approval file が生成されることを検証できる。

4.2. If `slide:approve` に `--by` が指定されない場合, the slide workflow smoke validation shall approval file が生成されず非ゼロ終了することを検証できる。

4.3. If `slide:approve` を `polish` または `deliver` に対して実行する場合, the slide workflow smoke validation shall approval file が生成されず非ゼロ終了することを検証できる。

4.4. The slide workflow smoke validation shall canonical workflow 実行だけでは approval file が生成されないことを確認できる。

### 要件 5: report front matter と convergence behavior を検証する

**目的:** メンテナとして、plan/compose/polish/deliver の report が foundation の state validation で読めることを確認したい。

#### 受け入れ条件

5.1. When `plan` と `compose` が成功する場合, the slide workflow smoke validation shall `result: passed` の supervision report を確認できる。

5.2. When `polish` と `deliver` が成功する場合, the slide workflow smoke validation shall expected state と `result: passed` の supervision report を確認できる。

5.3. If loop monitor が非収束または同一 finding 反復を検出する場合, the slide workflow smoke validation shall success supervision に進まないことを検証できる。

5.4. If supervision report の front matter が欠落、不一致、または stale である場合, the slide workflow smoke validation shall state validation が失敗することを検証できる。

### 要件 6: render evidence と delivery artifact の分離を検証する

**目的:** メンテナとして、`polish` の visual/render evidence と `deliver` の official artifact を混同せず確認したい。

#### 受け入れ条件

6.1. When `polish` が実行される場合, the slide workflow smoke validation shall `.takt/render/<deck>/` 配下に render evidence と metadata が生成されることを確認できる。

6.2. If optional PDF rasterization tool が利用できない場合, the slide workflow smoke validation shall degraded evidence として記録され、HTML PNG evidence の失敗とは区別されることを検証できる。

6.3. When `deliver` が実行される場合, the slide workflow smoke validation shall `dist/<deck>/` が export 前に clean され、`plan.md` の `deliverables` に列挙された artifacts が生成されることを確認できる。

6.4. The slide workflow smoke validation shall render evidence を `dist/<deck>/` の official delivery artifacts として扱わないことを検証できる。

### 要件 7: rerun、force、history archive の挙動を検証する

**目的:** メンテナとして、successful rerun と rejected rerun と force invalidation の違いを実行で確認したい。

#### 受け入れ条件

7.1. If command が successful state に到達済みで `--force` が指定されない場合, the slide workflow smoke validation shall TAKT が起動せず rerun が拒否されることを検証できる。

7.2. If command の canonical supervision が `result: rejected` である場合, the slide workflow smoke validation shall `--force` なしの rerun が許可され、既存 command report が history へ archive されることを検証できる。

7.3. When `--force` が指定される場合, the slide workflow smoke validation shall 対象 command 以降の canonical reports と approval files が history へ archive されることを検証できる。

7.4. When force invalidation が実行される場合, the slide workflow smoke validation shall stale generated outputs が clean され、source artifacts が保持されることを確認できる。

### 要件 8: smoke で見つかった integration issue を最小範囲で収束する

**目的:** メンテナとして、実行で見つかった契約ズレを放置せず、上流 spec の主旨に沿って最小修正したい。

#### 受け入れ条件

8.1. When smoke validation が integration issue を検出する場合, the slide workflow smoke validation shall issue を foundation 契約、orchestration 契約、smoke fixture/validation のいずれかに分類できる。

8.2. If integration issue が既存 spec の契約内で修正できる場合, the slide workflow smoke validation shall command/state model または workflow semantics を再定義せずに、fixture、validation script、wrapper wiring、workflow/facet reference mismatch の範囲で最小修正できる。

8.3. If integration issue が上流 spec と矛盾する場合, the slide workflow smoke validation shall 修正を upstream feedback として明示し、smoke spec 内で新しい意味論として隠さない。

8.4. When smoke validation が完了する場合, the slide workflow smoke validation shall `slides/<deck>/review/smoke-summary.md` に、実行した command、検証した failure path、生成された evidence/artifacts、残存リスクを確認できる結果を残す。
