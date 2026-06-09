---
marp: true
theme: default
paginate: true
title: TAKTでAI開発を制御する
html: true
---

<style>
@font-face {
  font-family: "Noto Sans JP";
  font-weight: 400;
  src: url("node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff2") format("woff2");
}
@font-face {
  font-family: "Noto Sans JP";
  font-weight: 700;
  src: url("node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-700-normal.woff2") format("woff2");
}
:root {
  --font-sans: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif;
  --font-mono: "SFMono-Regular", "Menlo", "Consolas", monospace;
  --ls-base: 0.01em;
  --lh-tight: 1.25;
  --lh-body: 1.6;
  --fs-h1: 33px;
  --fs-title: 54px;
  --fs-subtitle: 26px;
  --fs-lead: 24px;
  --fs-bullet: 22px;
  --fs-caption: 18px;
  --fs-code: 17px;
  --pad-section: 44px 64px;
  --pad-visual-full: 32px 56px;
  --gap-col: 36px;
  --gap-list: 12px;
  --gap-lead: 24px;
  --pad-card: 20px 26px;
  --c-text: #1d2330;
  --c-muted: #5b6472;
  --c-accent: #2f6df0;
  --c-success: #1f9d6b;
  --c-warning: #d9822b;
  --c-border: #d5dae3;
  --c-surface: #f5f7fb;
}
section {
  font-family: var(--font-sans);
  letter-spacing: var(--ls-base);
  color: var(--c-text);
  font-size: var(--fs-bullet);
  line-height: var(--lh-body);
  padding: var(--pad-section);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
section h1 {
  font-size: var(--fs-h1);
  line-height: var(--lh-tight);
  font-weight: 700;
  margin: 0 0 var(--gap-lead) 0;
}
section ul { margin: 0; padding-left: 1.2em; }
section li { margin-bottom: var(--gap-list); }
section li::marker { color: var(--c-accent); }
section code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--c-surface);
  padding: 0.05em 0.35em;
  border-radius: 4px;
}
section pre {
  font-size: var(--fs-code);
  line-height: 1.5;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 18px 20px;
  margin: 0;
}
section pre code { background: none; padding: 0; font-size: 1em; }
.lead {
  font-size: var(--fs-lead);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--c-accent);
  margin: 0 0 var(--gap-lead) 0;
}
.caption {
  font-size: var(--fs-caption);
  color: var(--c-muted);
  margin: 10px 0 0 0;
}
.accent { color: var(--c-accent); }
.success { color: var(--c-success); }
.warning { color: var(--c-warning); }

section.title { text-align: center; align-items: center; }
section.title .maintitle {
  font-size: var(--fs-title);
  font-weight: 700;
  line-height: var(--lh-tight);
  margin: 0 0 14px 0;
}
section.title .subtitle {
  font-size: var(--fs-subtitle);
  color: var(--c-muted);
  margin: 0 0 var(--gap-lead) 0;
}
section.title .author {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 10px 0;
}
section.title .event {
  font-size: var(--fs-caption);
  color: var(--c-muted);
  margin: 0 0 var(--gap-lead) 0;
}
section.title ul { text-align: left; }

section.visual-full { align-items: stretch; padding: var(--pad-visual-full); }
section.visual-full h1 { margin-bottom: 14px; }
section.visual-full svg.fig {
  display: block;
  width: 100%;
  height: auto;
  max-height: 64vh;
  margin: 6px auto 0 auto;
}

section.compare-2col .cols {
  display: grid;
  gap: var(--gap-col);
  grid-template-columns: 1fr 1fr;
  align-items: stretch;
}
section.compare-2col .card {
  padding: var(--pad-card);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 8px;
}
section.compare-2col .card h2 {
  font-size: var(--fs-lead);
  margin: 0 0 var(--gap-list) 0;
}
section.compare-2col .card.ng h2 { color: var(--c-muted); }
section.compare-2col .card.ok h2 { color: var(--c-accent); }

section.code-2col .cols {
  display: grid;
  gap: var(--gap-col);
  grid-template-columns: 1.15fr 1fr;
  align-items: center;
}

section.infographic { padding: 32px 52px; justify-content: flex-start; }
section.infographic h1 { font-size: 28px; margin-bottom: 16px; }
section.infographic .ig-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  flex: 1;
  align-content: stretch;
}
section.infographic .ig-card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 10px;
  padding: 14px 18px;
  font-size: 16px;
  line-height: 1.5;
}
section.infographic .ig-card.hero { border-top: 4px solid var(--c-accent); background: #ffffff; }
section.infographic .ig-card h3 {
  font-size: 18px;
  margin: 0 0 8px 0;
  color: var(--c-accent);
  line-height: 1.3;
}
section.infographic .ig-card p { margin: 0 0 6px 0; color: var(--c-text); }
section.infographic .ig-card .mut { color: var(--c-muted); }
section.infographic .ig-card ul { padding-left: 1.1em; margin: 0; }
section.infographic .ig-card li { margin-bottom: 5px; line-height: 1.45; }
section.infographic .ig-card code { font-size: 0.85em; background: #ffffff; border: 1px solid var(--c-border); }
section.infographic .ig-card.hero code { background: var(--c-surface); border: none; }
section.infographic .chip {
  display: inline-block;
  font-size: 14px;
  padding: 2px 10px;
  border-radius: 12px;
  margin: 0 4px 5px 0;
  background: #ffffff;
  border: 1px solid var(--c-border);
}
section.infographic .chip.st { border-color: var(--c-success); color: var(--c-success); font-weight: 600; }
section.infographic .chip.bt { border-color: var(--c-warning); color: var(--c-warning); }

.pat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  align-items: stretch;
}
.pat-grid .ig-card.pat {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-top: 4px solid var(--c-accent);
  border-radius: 10px;
  padding: 16px 18px;
  font-size: 17px;
  line-height: 1.55;
}
.pat-grid .ig-card.pat h3 {
  font-size: 19px;
  color: var(--c-accent);
  margin: 0 0 8px 0;
  font-family: var(--font-mono);
}
.pat-grid .ig-card.pat p { margin: 0; }
.pat-grid .ig-card.pat code { font-size: 0.85em; background: #ffffff; border: 1px solid var(--c-border); }
.closing {
  margin: 22px 0 0 0;
  padding: 14px 20px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 8px;
  text-align: center;
  font-size: 21px;
  line-height: 1.55;
}
</style>

<!-- _class: title -->
<!-- _paginate: false -->

<p class="maintitle">TAKTでAI開発を制御する</p>
<p class="subtitle">takt-sddに見る cc-sdd v3 品質ゲート設計</p>
<p class="author">かとじゅん(@j5ik2o)</p>
<p class="event">takt-sdd with cc-sdd v3 — 2026-06-10 / Online / 28min</p>

- TAKTが決定論化するのは AI の出力ではなく、**実行経路・分岐・証跡・完了判定**
- takt-sdd は、AIエージェントによる開発を**閉じた品質ループ**に載せる実例

<!--
TAKT勉強会として、takt-sddの紹介にとどめず「TAKTでAI開発の品質をどう制御するか」という設計実例として話す。冒頭で線を引く: AIを賢くする話ではなく、AIの周りを設計する話。まずcc-sdd v3の全体像から入る。
-->

---

<!-- _class: infographic -->

# cc-sdd: AIエージェントによる自律的な仕様書駆動開発の完全ガイド

<div class="ig-grid">
<div class="ig-card hero">
<h3>1. Discovery（探索・振り分け）</h3>
<p><code>/kiro-discovery</code> を起点に、既存 spec の拡張 / 新規 spec 作成 / spec なし直接実装 / 複数 spec への分解 を判断し、概要（<code>brief.md</code>）を作成。</p>
</div>
<div class="ig-card hero">
<h3>2. Spec Generation（仕様策定）</h3>
<p>要件定義（EARS 形式）→ 設計（Mermaid 図 + File Structure Plan）→ タスク分割の 3 段階を経て、実装の「契約」を固める。</p>
</div>
<div class="ig-card hero">
<h3>3. Autonomous Implementation（自律実装）</h3>
<p><code>/kiro-impl</code> を実行。タスクごとに独立した implementer が担当し、TDD サイクル（<span class="warning">RED</span> → <span class="success">GREEN</span>）でコードを書き上げる。</p>
</div>
<div class="ig-card">
<h3>生成される主要ドキュメント</h3>
<ul>
<li><code>requirements.md</code> — EARS 要件と明確な受入基準</li>
<li><code>design.md</code> — アーキテクチャ図解と File Structure Plan</li>
<li><code>tasks.md</code> — Boundary / Depends が明記された実行用タスクリスト</li>
</ul>
</div>
<div class="ig-card">
<h3><code>/kiro-impl</code> の自律的な仕組み</h3>
<ul>
<li><strong>TDD</strong> — テスト失敗（RED）→ 成功（GREEN）を自動で反復</li>
<li><strong>独立レビューと自動デバッグ</strong> — 実装とは別のレビュアーが検証。blocked / 2 回否決で auto-debug が根本原因を調査</li>
<li><strong>境界重視（Boundary-first）</strong> — File Structure Plan に基づき境界違反をチェック</li>
</ul>
</div>
<div class="ig-card">
<h3>対応エージェントとステータス</h3>
<p>8 エージェント × 共通 17 スキル。プラットフォームを問わず同じワークフロー。</p>
<p>
<span class="chip st">Claude Code — Stable</span>
<span class="chip st">Codex — Stable</span><br/>
<span class="chip bt">Cursor</span>
<span class="chip bt">Copilot</span>
<span class="chip bt">Windsurf</span>
<span class="chip bt">OpenCode</span>
<span class="chip bt">Gemini CLI</span>
<span class="chip bt">Antigravity — Beta</span>
</p>
<p class="mut">takt-sdd は pinned <code>cc-sdd@3.0.2</code> で初期化する。</p>
</div>
</div>

<!--
cc-sdd v3そのものの1枚要約。出典はcc-sdd README v3.0: discoveryの振り分け（拡張/新規/直接実装/分解、brief.md・roadmap.md）、EARS+受入基準、design.mdのMermaid+File Structure Plan、tasks.mdのBoundary/Depends注記、kiro-implのタスクごとfresh implementer+TDD(RED→GREEN, feature flag配下)+独立レビュアー+auto-debug（blockedまたは2回否決で発動）、8エージェント×17スキル（Claude Code/Codex stable、他beta）。ここは2分以内で流し、「この流れをtakt-sddはTAKT workflowとして制御する」へ繋ぐ。次のスライドでフロー全体をkiro:*の実行順として見る。
-->

---

<!-- _class: visual-full -->

# cc-sdd v3 / Kiro-style SDDは仕様生成から実装・検証へ進む

<svg class="fig" viewBox="0 0 1100 470" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="cc-sdd v3 / Kiro-style SDD の基本フロー">
  <defs>
    <marker id="ar1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/>
    </marker>
  </defs>
  <style>
    .box { fill: #ffffff; stroke: #2f6df0; stroke-width: 2; rx: 10; }
    .gate { fill: #fdf3e7; stroke: #d9822b; stroke-width: 2; }
    .name { font: 700 21px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #1d2330; text-anchor: middle; }
    .sub  { font: 400 16px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #5b6472; text-anchor: middle; }
    .art  { font: 400 16px "SFMono-Regular","Menlo",monospace; fill: #2f6df0; text-anchor: middle; }
    .flow { stroke: #5b6472; stroke-width: 2; fill: none; marker-end: url(#ar1); }
  </style>
  <!-- row 1 -->
  <rect class="box" x="30"  y="60" width="230" height="64" rx="10"/>
  <text class="name" x="145" y="88">kiro-discovery</text>
  <text class="sub"  x="145" y="112">アイデア分類 / roadmap</text>
  <rect class="box" x="300" y="60" width="230" height="64" rx="10"/>
  <text class="name" x="415" y="88">kiro-spec-init</text>
  <text class="sub"  x="415" y="112">spec の初期化</text>
  <rect class="box" x="570" y="60" width="230" height="64" rx="10"/>
  <text x="685" y="88" style="font:700 18px &quot;Hiragino Sans&quot;,&quot;Noto Sans JP&quot;,sans-serif" fill="#1d2330" text-anchor="middle">kiro-spec-requirements</text>
  <text class="sub"  x="685" y="112">EARS 形式の要件</text>
  <rect class="box" x="840" y="60" width="230" height="64" rx="10"/>
  <text class="name" x="955" y="88">kiro-spec-design</text>
  <text class="sub"  x="955" y="112">技術設計 + 発見ログ</text>
  <text class="art" x="685" y="46">requirements.md</text>
  <text class="art" x="955" y="46">design.md / research.md</text>
  <line class="flow" x1="260" y1="92" x2="294" y2="92"/>
  <line class="flow" x1="530" y1="92" x2="564" y2="92"/>
  <line class="flow" x1="800" y1="92" x2="834" y2="92"/>
  <!-- down -->
  <path class="flow" d="M 955 124 L 955 196"/>
  <!-- row 2 (right to left) -->
  <rect class="box gate" x="840" y="202" width="230" height="64" rx="10"/>
  <text class="name" x="955" y="230">kiro-validate-design</text>
  <text class="sub"  x="955" y="254">read-only / GO・NO-GO</text>
  <rect class="box" x="570" y="202" width="230" height="64" rx="10"/>
  <text class="name" x="685" y="230">kiro-spec-tasks</text>
  <text class="sub"  x="685" y="254">実装タスク生成</text>
  <rect class="box" x="300" y="202" width="230" height="64" rx="10"/>
  <text class="name" x="415" y="230">kiro-impl</text>
  <text class="sub"  x="415" y="254">gate 付き実装</text>
  <rect class="box gate" x="30"  y="202" width="230" height="64" rx="10"/>
  <text class="name" x="145" y="230">kiro-validate-impl</text>
  <text class="sub"  x="145" y="254">read-only / 最終検証</text>
  <text class="art" x="955" y="290">design-review.md</text>
  <text class="art" x="685" y="290">tasks.md</text>
  <text class="art" x="415" y="290">tasks.md 進捗更新</text>
  <line class="flow" x1="834" y1="234" x2="806" y2="234"/>
  <line class="flow" x1="564" y1="234" x2="536" y2="234"/>
  <line class="flow" x1="294" y1="234" x2="266" y2="234"/>
  <!-- artifacts strip -->
  <rect x="30" y="340" width="1040" height="80" rx="10" fill="#f5f7fb" stroke="#d5dae3" stroke-width="1.5"/>
  <text class="name" x="550" y="374">成果物はすべて <tspan fill="#2f6df0" font-family="Menlo,monospace">.kiro/specs/{feature}/</tspan> に蓄積</text>
  <text class="sub"  x="550" y="402">Kiro の仕様フォーマットと互換 — 既存コードがあれば requirements 後に kiro-validate-gap も挟める</text>
</svg>

<p class="caption">discovery から spec 生成・design validation・tasks・実装・final validation へ。成果物は <code>.kiro/specs/{feature}/</code> に蓄積され、Kiro と互換。</p>

<!--
cc-sddの一般紹介には寄せない。前提の確認だけ: 要件(EARS) → 設計 → タスク → 実装をspec artifact中心に進め、takt-sddはpinned cc-sdd@3.0.2で初期化し、この流れ全体をkiro:* npm scriptsからTAKT workflowとして実行する。既存コードがある場合はrequirementsの後にkiro-validate-gapも挟める。次: この流れを「AIに任せるだけ」だと何が決まらないか → TAKTは何を固定するのか。
-->

---

<!-- _class: single -->

# AIエージェントの1回実行では品質保証にならない

- 同じ指示でも、AIの**実行経路は毎回同じとは限らない**
- 受入条件未達・レビュー漏れが、人間レビューを**素通り**することがある
- 脆弱性や本番障害につながる変更も、1回の回答採用では止めにくい
- 本来必要なのは、必要な回数だけ回る **検出 → 修正 → 再検証** の閉じたループ
- TAKTは、このループを**ステートマシンとゲート**として設計可能にする

<!--
問題はAIが間違えること自体ではない。間違えたときに検出・修正・再検証する閉じたループが「設計されていない」ことが問題。実務ではチャットで1回の回答を採用しがちで、レビュー境界・完了判定・証跡が会話任せになる。次に、TAKTがこの流れの何を固定するのかを見る。
-->

---

<!-- _class: compare-2col -->

# TAKTはAI出力ではなく、実行制御面を決定論化する

<p class="lead">AIの非決定性は消せない。消すのではなく、制御面で囲い込む。</p>

<div class="cols">
<div class="card ng">

## AI に残すもの（非決定的なまま）

- 成果物の中身 — 要件文・設計・コード
- 調査・発見・設計判断の根拠づくり
- レビューでの指摘内容

</div>
<div class="card ok">

## YAML で固定するもの（決定論的）

- 実行順序と遷移条件 — <code>steps + rules</code>
- 分岐先 — <code>fix / need_replan / ABORT</code>
- 証跡の形式 — <code>output contract</code>
- 完了判定 — validation gate を通過したときだけ

</div>
</div>

<!--
ここが今日の中心テーゼ。TAKTは「AIの回答を固定する」道具ではなく、「どのstepを、どの条件で、どの証跡をもって次へ進めるか」を固定する。自由会話ではなくステートマシンとしてworkflowが進む。次のスライドで、この制御の登場人物を1枚の地図で見せる。
-->

---

<!-- _class: visual-full -->

# どのstepを・どの条件で・どの証跡で次へ進めるかを固定する

<svg class="fig" viewBox="0 0 1100 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TAKT の構成要素: workflow YAML が steps / rules / facets / output contracts / loop_monitors / workflow_call を束ねる">
  <defs>
    <marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/>
    </marker>
  </defs>
  <style>
    .a-name { font: 700 20px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #1d2330; text-anchor: middle; }
    .a-sub  { font: 400 15px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #5b6472; text-anchor: middle; }
    .a-mono { font: 400 15px "SFMono-Regular","Menlo",monospace; fill: #2f6df0; text-anchor: middle; }
    .a-flow { stroke: #5b6472; stroke-width: 2; fill: none; marker-end: url(#ar2); }
  </style>
  <!-- 入口 -->
  <rect x="20" y="170" width="180" height="120" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="a-name" x="110" y="210">入口</text>
  <text class="a-mono" x="110" y="238">kiro:* scripts</text>
  <text class="a-sub"  x="110" y="262">安定した surface</text>
  <line class="a-flow" x1="200" y1="230" x2="238" y2="230"/>
  <!-- piece 外枠 -->
  <rect x="245" y="30" width="600" height="440" rx="12" fill="#f5f7fb" stroke="#2f6df0" stroke-width="2.5"/>
  <text class="a-name" x="545" y="64">workflow（YAML）— 実行制御を宣言</text>
  <!-- steps -->
  <rect x="275" y="90" width="150" height="56" rx="8" fill="#ffffff" stroke="#1d2330" stroke-width="1.8"/>
  <text class="a-name" x="350" y="124">step</text>
  <rect x="475" y="90" width="150" height="56" rx="8" fill="#ffffff" stroke="#1d2330" stroke-width="1.8"/>
  <text class="a-name" x="550" y="124">step</text>
  <rect x="675" y="90" width="150" height="56" rx="8" fill="#ffffff" stroke="#1d2330" stroke-width="1.8"/>
  <text class="a-name" x="750" y="124">step</text>
  <line class="a-flow" x1="425" y1="118" x2="469" y2="118"/>
  <line class="a-flow" x1="625" y1="118" x2="669" y2="118"/>
  <path class="a-flow" d="M 750 146 C 750 185 550 185 552 150"/>
  <text class="a-sub" x="652" y="192">rules: condition → next（分岐・差し戻し）</text>
  <!-- facets -->
  <rect x="275" y="225" width="550" height="100" rx="8" fill="#ffffff" stroke="#d5dae3" stroke-width="1.5"/>
  <text class="a-name" x="550" y="255">facets — プロンプトを 5 つの関心事に分離</text>
  <g font-family='"Hiragino Sans","Noto Sans JP",sans-serif' font-size="16" text-anchor="middle">
    <rect x="290" y="272" width="100" height="34" rx="17" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="340" y="294" fill="#1d2330">Persona</text>
    <rect x="398" y="272" width="92" height="34" rx="17" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="444" y="294" fill="#1d2330">Policy</text>
    <rect x="498" y="272" width="120" height="34" rx="17" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="558" y="294" fill="#1d2330">Instruction</text>
    <rect x="626" y="272" width="112" height="34" rx="17" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="682" y="294" fill="#1d2330">Knowledge</text>
    <rect x="746" y="272" width="68" height="34" rx="17" fill="#fdf3e7" stroke="#d9822b"/>
    <text x="780" y="294" fill="#1d2330">O.C.</text>
  </g>
  <!-- contracts / monitors / call -->
  <rect x="275" y="355" width="260" height="90" rx="8" fill="#fdf3e7" stroke="#d9822b" stroke-width="1.8"/>
  <text class="a-name" x="405" y="388">output contracts</text>
  <text class="a-sub"  x="405" y="412">STATUS / VERDICT / evidence</text>
  <text class="a-sub"  x="405" y="432">→ rules が機械的に評価</text>
  <rect x="555" y="355" width="160" height="90" rx="8" fill="#ffffff" stroke="#d9822b" stroke-width="1.8" stroke-dasharray="6 4"/>
  <text class="a-name" x="635" y="388">loop_monitors</text>
  <text class="a-sub"  x="635" y="412">反復を監視し</text>
  <text class="a-sub"  x="635" y="432">閾値で介入</text>
  <rect x="735" y="355" width="90" height="90" rx="8" fill="#ffffff" stroke="#1f9d6b" stroke-width="1.8"/>
  <text class="a-name" x="780" y="384">workflow</text>
  <text class="a-name" x="780" y="408">_call</text>
  <text class="a-sub"  x="780" y="432">合成</text>
  <!-- 出力 -->
  <line class="a-flow" x1="845" y1="230" x2="883" y2="230"/>
  <rect x="890" y="105" width="190" height="120" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="a-name" x="985" y="140">spec artifacts</text>
  <text class="a-mono" x="985" y="168">.kiro/specs/</text>
  <text class="a-sub"  x="985" y="194">requirements / design</text>
  <text class="a-sub"  x="985" y="214">/ tasks</text>
  <rect x="890" y="255" width="190" height="120" rx="10" fill="#ffffff" stroke="#1f9d6b" stroke-width="2"/>
  <text class="a-name" x="985" y="292">evidence</text>
  <text class="a-sub"  x="985" y="320">validation / review の</text>
  <text class="a-sub"  x="985" y="340">判定根拠・証跡</text>
</svg>

<p class="caption">workflow（YAML）が steps・rules・facets・output contracts・loop_monitors・workflow_call を束ね、spec artifacts と evidence へ落とす。</p>

<!--
読み方: 入口はkiro:* npm scripts（安定したsurface）。中身はTAKTのworkflow YAML。stepが実行単位で、各stepにはfacetsで組んだプロンプトが与えられ、出力はoutput contractで機械可読にされ、rulesがそのフィールドを読んで次のstepを決める。loop_monitorsが反復を監視し、workflow_callで別workflowをサブルーチンとして合成できる。結果は.kiro/specs/のartifactとvalidation/review evidence。次の2枚でfacet/contractと、生成vs検証の分離を掘る。
-->

---

<!-- _class: code-2col -->

# プロンプトを分解し、ルールが読める機械可読な状態を作る

<div class="cols">
<div>

```yaml
steps:
  - name: review
    persona: ai-antipattern-reviewer   # facet参照
    instruction: ai-review
    output_contracts:
      report:
        - name: ai-review.md
          format: ai-review   # STATUS / findings / evidence
    rules:
      - condition: AI固有の問題なし
        next: COMPLETE
      - condition: AI固有の問題あり
        next: fix
```

</div>
<div>

- プロンプトは monolith にせず **5 facets** に分離 — <code>Persona / Policy / Instruction / Knowledge / Output Contract</code>
- output contract が <code>STATUS</code>・<code>VERDICT</code>・finding 数・evidence を**機械可読**にする
- rules は自由文の印象ではなく、**contract のフィールド**で次の step を決める
- <code>kiro:*</code> scripts は、この構造を呼ぶ**安定した入口**

</div>
</div>

<!--
構造例として実際のbuiltinと同じ形を見せている。facetはworkflow間で再利用・差し替え可能で、重複を排除する。強調すべきはoutput contract: これがないと「次へ進んでいいか」の判断がAIの自由文をAIが解釈する伝言ゲームになる。contractがあるからrulesが決定論的に評価できる。
-->

---

<!-- _class: compare-2col -->

# 状態を変更する生成ステップと、読み取り専用の判定ゲートを分離する

<p class="lead">生成と検証を同じ step に混ぜると「作った本人が通した」になる。</p>

<div class="cols">
<div class="card ok">

## state-changing（生成）

- <code>kiro-spec-init</code> / <code>kiro-spec-quick</code>
- <code>kiro-spec-requirements</code>
- <code>kiro-spec-design</code>
- <code>kiro-spec-tasks</code>
- <code>kiro-impl</code>

</div>
<div class="card ok">

## read-only（判定）

- <code>kiro-spec-status</code>
- <code>kiro-validate-gap</code>
- <code>kiro-validate-design</code> — GO / NO-GO
- <code>kiro-validate-impl</code>
- artifact を直さず、不足証跡・manual check を返す

</div>
</div>

<!--
validation系workflowはread-onlyに保たれる: artifactを勝手に修正せず、GO/NO-GO、不足している証跡、残るmanual checkを返すだけ。そして「検証不能な項目を成功扱いにしない」が原則。成功の根拠が常に明示される。次: 問題が見つかったときにどう閉じるか = AI quality gate。
-->

---

<!-- _class: visual-full -->

# AI品質ゲートは検出だけでなく、修正と再計画の分岐でループを閉じる

<svg class="fig" viewBox="0 0 1100 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AI quality gate の閉ループ: review から COMPLETE / fix / need_replan への分岐">
  <defs>
    <marker id="ar4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/>
    </marker>
    <marker id="ar4g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#1f9d6b"/>
    </marker>
    <marker id="ar4w" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#d9822b"/>
    </marker>
  </defs>
  <style>
    .g-name { font: 700 21px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #1d2330; text-anchor: middle; }
    .g-sub  { font: 400 16px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #5b6472; text-anchor: middle; }
    .g-lbl  { font: 400 17px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #1d2330; }
    .g-flow { stroke: #5b6472; stroke-width: 2; fill: none; marker-end: url(#ar4); }
  </style>
  <!-- review -->
  <rect x="60" y="160" width="240" height="90" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2.5"/>
  <text class="g-name" x="180" y="198">review</text>
  <text class="g-sub"  x="180" y="226">AI antipattern reviewer</text>
  <!-- COMPLETE -->
  <path d="M 300 185 C 480 110 640 95 818 95" stroke="#1f9d6b" stroke-width="2.5" fill="none" marker-end="url(#ar4g)"/>
  <text class="g-lbl" x="430" y="108">AI 固有の問題なし</text>
  <rect x="825" y="60" width="220" height="70" rx="10" fill="#e9f7f1" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="g-name" x="935" y="103">COMPLETE</text>
  <!-- fix loop -->
  <path class="g-flow" d="M 280 250 C 350 320 420 345 488 352"/>
  <text class="g-lbl" x="305" y="330">問題あり</text>
  <rect x="495" y="320" width="180" height="70" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="g-name" x="585" y="350">fix</text>
  <text class="g-sub"  x="585" y="375">指摘を修正</text>
  <path class="g-flow" d="M 510 320 C 400 270 330 250 306 235"/>
  <text class="g-lbl" x="380" y="262">review へ戻る</text>
  <!-- need_replan -->
  <path d="M 300 220 C 520 230 640 245 818 268" stroke="#d9822b" stroke-width="2.5" fill="none" marker-end="url(#ar4w)"/>
  <text class="g-lbl" x="430" y="218">ambiguous / blocked / 内部矛盾</text>
  <rect x="825" y="240" width="220" height="70" rx="10" fill="#fdf3e7" stroke="#d9822b" stroke-width="2.5"/>
  <text class="g-name" x="935" y="270">need_replan</text>
  <text class="g-sub"  x="935" y="294">計画へ安全に差し戻す</text>
  <!-- loop monitor -->
  <rect x="495" y="20" width="250" height="64" rx="10" fill="#ffffff" stroke="#d9822b" stroke-width="2" stroke-dasharray="6 4"/>
  <text class="g-name" x="620" y="46">loop_monitors</text>
  <text class="g-sub"  x="620" y="70">review ⇄ fix の反復を監視</text>
  <path d="M 745 60 C 800 90 830 150 845 232" stroke="#d9822b" stroke-width="2" stroke-dasharray="6 4" fill="none" marker-end="url(#ar4w)"/>
  <text class="g-lbl" x="800" y="160">threshold 到達</text>
</svg>

<p class="caption">検出例: hallucinated path / API、scope mismatch、unsupported claim、unused artifact。gate の本質は検出項目数ではなく <code>fix / need_replan</code> への<strong>分岐</strong>にある。</p>

<!--
AI固有のアンチパターン（存在しないAPIやpathの参照、タスク範囲とのずれ、根拠のない主張、使われない生成物）を専用reviewerが検出する。重要なのはその後: 問題があればfixに送りreviewへ戻す閉ループ。判定が曖昧・ブロック・内部矛盾ならneed_replanへ。さらにloop_monitorsが反復回数を監視し、閾値到達で非生産的ループと判定されれば安全にreplanへエスカレーションする。「1回の回答を採用する」使い方との決定的な違い。次が山場: このgateを部品として組み込んだkiro-impl。
-->

---

<!-- _class: visual-full -->

# `kiro-impl` は実装から最終検証までを1つのワークフローで制御する

<svg class="fig" viewBox="0 0 1100 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="kiro-impl の制御スタック: plan-one-task から final validate まで">
  <defs>
    <marker id="ar3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/>
    </marker>
    <marker id="ar3w" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#d9822b"/>
    </marker>
  </defs>
  <style>
    .i-name { font: 700 20px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #1d2330; text-anchor: middle; }
    .i-sub  { font: 400 15px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #5b6472; text-anchor: middle; }
    .i-lbl  { font: 400 16px "Hiragino Sans","Noto Sans JP",sans-serif; fill: #1d2330; }
    .i-flow { stroke: #5b6472; stroke-width: 2; fill: none; marker-end: url(#ar3); }
  </style>
  <!-- row 1 -->
  <rect x="30" y="60" width="200" height="80" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="i-name" x="130" y="93">plan-one-task</text>
  <text class="i-sub"  x="130" y="118">approved task を 1 つ選ぶ</text>
  <rect x="280" y="60" width="190" height="80" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="i-name" x="375" y="93">execute-task</text>
  <text class="i-sub"  x="375" y="118">selected task のみ実装</text>
  <rect x="520" y="55" width="230" height="90" rx="10" fill="#eaf1fe" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="i-name" x="635" y="85">workflow_call</text>
  <text class="i-sub"  x="635" y="109">kiro-ai-quality-gate</text>
  <text class="i-sub"  x="635" y="130">subworkflow として合成</text>
  <rect x="800" y="40" width="270" height="170" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="i-name" x="935" y="70">parallel review — 4 観点</text>
  <g font-family='"Hiragino Sans","Noto Sans JP",sans-serif' font-size="16" text-anchor="middle">
    <rect x="818" y="88" width="110" height="40" rx="8" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="873" y="113" fill="#1d2330">coding</text>
    <rect x="942" y="88" width="110" height="40" rx="8" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="997" y="113" fill="#1d2330">architecture</text>
    <rect x="818" y="140" width="110" height="40" rx="8" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="873" y="165" fill="#1d2330">QA</text>
    <rect x="942" y="140" width="110" height="40" rx="8" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="997" y="165" fill="#1d2330">testing</text>
  </g>
  <line class="i-flow" x1="230" y1="100" x2="274" y2="100"/>
  <line class="i-flow" x1="470" y1="100" x2="514" y2="100"/>
  <line class="i-flow" x1="750" y1="100" x2="794" y2="100"/>
  <!-- fix loop from reviewers -->
  <path class="i-flow" d="M 935 210 L 935 280 L 700 280"/>
  <text class="i-lbl" x="780" y="270">needs_fix → 修正して再 review</text>
  <rect x="520" y="250" width="170" height="60" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="i-name" x="605" y="287">fix</text>
  <path class="i-flow" d="M 605 250 C 700 225 850 220 900 213"/>
  <!-- verification row -->
  <path class="i-flow" d="M 460 280 L 310 280"/>
  <rect x="45" y="250" width="270" height="60" rx="10" fill="#ffffff" stroke="#1f9d6b" stroke-width="2"/>
  <text class="i-name" x="180" y="275" font-size="19">completion verification</text>
  <text class="i-sub"  x="180" y="298">証跡を確認して完了判定</text>
  <path class="i-flow" d="M 180 310 L 180 360"/>
  <rect x="60" y="365" width="240" height="70" rx="10" fill="#e9f7f1" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="i-name" x="180" y="394">kiro-validate-impl</text>
  <text class="i-sub"  x="180" y="418">read-only の最終 gate</text>
  <!-- loop monitors -->
  <rect x="420" y="350" width="650" height="100" rx="10" fill="#fffdf9" stroke="#d9822b" stroke-width="2" stroke-dasharray="6 4"/>
  <text class="i-name" x="745" y="386">loop_monitors</text>
  <text class="i-sub"  x="745" y="412">execute / review / fix の未収束ループを監視 — threshold 到達で supervisor が判定</text>
  <text class="i-sub"  x="745" y="434">非生産的なら need_replan へエスカレーション（parent 側で計画へ戻す）</text>
  <path d="M 605 350 L 605 316" stroke="#d9822b" stroke-width="2" stroke-dasharray="6 4" fill="none" marker-end="url(#ar3w)"/>
</svg>

<p class="caption"><code>kiro-impl</code> は 1 タスク実装・AI gate（subworkflow）・4 観点並列 review・loop 監視・completion verification・read-only validate を 1 つに合成する。</p>

<!--
TAKTが「手順の自動化」ではなく「品質制御の合成」である例。(1) plan-one-taskでapproved taskを1つだけ選ぶ＝one-task iteration。(2) 実装後、AI quality gateをworkflow_callでsubworkflowとして呼ぶ。(3) coding / architecture / QA / testing の4観点reviewをparallelで走らせ、レビュー漏れを構造で抑える（security専用gateとは言わない）。(4) loop_monitorsがexecute/review/fixの未収束を監視。(5) completion verificationで証跡を確認し、最後にread-onlyのkiro-validate-implを通って初めて完了扱い。need_replanはparent側で計画へ戻す。
-->

---

<!-- _class: single -->

# TAKTから学ぶ、AI開発をワークフローとして設計する4つのパターン

<div class="pat-grid">
<div class="ig-card pat">
<h3>1. Decompose Work</h3>
<p>AI作業を <code>step + rule + contract</code> に分解する。プロンプトへの依存を減らす。</p>
</div>
<div class="ig-card pat">
<h3>2. Separate Concerns</h3>
<p>状態変更 workflow と read-only validation を厳格に分ける。自己承認を防ぐ。</p>
</div>
<div class="ig-card pat">
<h3>3. Design the Branch</h3>
<p>AI gate は検出だけでなく、<code>fix</code> と <code>replan</code> の分岐を持つ。閉じたループを作る。</p>
</div>
<div class="ig-card pat">
<h3>4. Enforce Limits</h3>
<p><code>parallel review</code> と <code>loop monitor</code> で、レビュー漏れや未収束（無限ループ）を強制遮断する。</p>
</div>
</div>

<p class="closing">cc-sdd v3 をこの形で包むことで、工数削減と品質向上を同時に実現する。<br/>AI開発をプロンプトではなく<strong>「ワークフローと契約」</strong>として設計する。</p>

<!--
締め: takt-sddは単なるcc-sddラッパーではなく、AI開発を閉じた品質ループとして運用する実例。今日の価値はすでに実体化している品質制御にある（workflow YAMLとkiro:* surfaceが根拠）。導入はnpx create-takt-sddの一発で、CLI導線の整備は今後の話として一言だけ。最後にタイトル「TAKTでAI開発を制御する」へ戻して終了。質疑へ。
-->
