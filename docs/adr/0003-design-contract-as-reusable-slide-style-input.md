# Claude Design Source を唯一のデザインシステム入力にする

`compose` が毎回 `design-system.md` を生成すると、デザインシステムが資料ごとの一時成果物になり、再利用されるデザインテンプレートとして扱いにくい。一方で、利用者が Markdown の Design Contract を直接評価・編集する前提も、デザイナーでない利用者には重い。今後は Claude Design Source（Claude Designソース）を唯一の user-facing design system 入力とし、手書き `design-contract.md`、bundled default profile、deck-local override は初期 scope から外す。

Design Contract（デザイン契約）は user-facing 入力ではなく、Claude Design Source を workflow が読める形に正規化した内部契約とする。`plan` と `compose` は同じ Resolved Design Contract（解決済みデザイン契約）を読み、`plan` は CSS を生成せず layout vocabulary / visual component / density rule を選ぶ。`compose` は解決済み契約から `SLIDES.md` の front matter CSS、`_class`、section HTML/CSS、visual source を生成し、`design-system.md` は compose の生成物から外す。

Claude Design Source を作成するための authoring input は `slides/<deck>/design/design-brief.md` として deck に残す。Design Brief（デザインブリーフ）は `brief.md` の資料要求と brand / audience / style constraints を Claude Design 向けに整えるための provenance artifact であり、Claude Design Source や Design Contract の代替入力ではない。Design Brief がない場合でも workflow は止めず、drift protection unavailable として記録する。通常 flow では生成済み `plan.md` / `slide-blueprint.md` を Design System 作成の primary input にせず、既存 plan を参考に再設計した場合も更新後の Claude Design Source から re-plan する。

この判断により、トップレベル command surface は `plan / compose / polish / deliver` のまま維持し、通常実行で consumer workspace へ workflow/facet template をコピーしない no-copy contract とも整合する。Claude Design export / handoff bundle の file schema は公式に固定公開されていないため、実サンプル discovery を先行し、その結果に合わせて importer、requirements、design、smoke validation を改訂する。
