---
marp: true
theme: default
paginate: true
title: TAKTでAI駆動開発の品質を設計する
html: true
---

<style>
@font-face {
  font-family: "Noto Sans JP";
  font-weight: 400;
  src: url("../../node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff2") format("woff2");
}
@font-face {
  font-family: "Noto Sans JP";
  font-weight: 700;
  src: url("../../node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-700-normal.woff2") format("woff2");
}
:root {
  --font-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif;
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
  background: #fafbfc;
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


section.profile { position: relative; padding-right: 460px; }
section.profile .photo {
  position: absolute;
  right: 64px;
  top: 50%;
  transform: translateY(-50%);
  width: 330px;
  height: auto;
  border-radius: 16px;
  border: 1px solid var(--c-border);
  box-shadow: 0 8px 24px rgba(29, 35, 48, 0.12);
}
section.profile .name { font-size: 40px; font-weight: 700; line-height: 1.3; margin: 0 0 6px 0; }
section.profile .name span { font-size: 21px; color: var(--c-muted); font-weight: 600; margin-left: 12px; }
section.profile .role { font-size: 20px; font-weight: 600; color: var(--c-accent); margin: 0 0 28px 0; }
section.profile li { margin-bottom: 16px; }

section.layers { justify-content: center; }
section.layers .ig-grid { flex: 0 0 auto; }

section.tag-takt, section.tag-sdd, section.tag-ccsdd { position: relative; }
section.tag-takt::before, section.tag-sdd::before, section.tag-ccsdd::before {
  position: absolute;
  top: 10px;
  right: 24px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  line-height: 1.4;
  color: #ffffff;
  padding: 3px 14px;
  border-radius: 9px;
}
section.dual { position: relative; }
.dualbadge { position: absolute; top: 10px; right: 24px; display: flex; gap: 8px; }
.dualbadge span { font-size: 15px; font-weight: 700; line-height: 1.4; color: #ffffff; padding: 3px 14px; border-radius: 9px; }
.dualbadge .b-takt { background: #2f6df0; letter-spacing: 2px; }
.dualbadge .b-sdd { background: #1f9d6b; letter-spacing: 0.5px; }
.dualbadge .b-imp { background: #e0312f; letter-spacing: 2px; }

section.tag-takt::before { content: "TAKT"; background: #2f6df0; }
section.tag-sdd::before { content: "takt-sdd"; background: #1f9d6b; letter-spacing: 0.5px; }
section.tag-ccsdd::before { content: "cc-sdd"; background: #d9822b; letter-spacing: 0.5px; }
</style>

<!-- _class: title -->
<!-- _paginate: false -->

<p class="maintitle">TAKTでAI駆動開発の品質を設計する</p>
<p class="subtitle">実例 takt-sdd で学ぶ、AI駆動開発の品質ゲート設計</p>
<p class="author">かとじゅん(@j5ik2o)</p>
<p class="event">takt-sdd with cc-sdd v3 — 2026-06-10 / Online / 28min</p>

<!--
【0.5分 / 累計 0:30】TAKT勉強会として、takt-sddの紹介にとどめず「TAKTでAI駆動開発の品質をどう設計するか」という実例として話す。冒頭で線を引く: AIを賢くする話ではなく、AIの周りを設計する話。
-->

---

<!-- _class: single profile -->

# 自己紹介

<img class="photo" src="./images/self-profile.jpg" alt="加藤潤一の写真" />

<p class="name">加藤潤一<span>かとじゅん / @j5ik2o</span></p>
<p class="role">IDEO PLUS合同会社 代表</p>

- 2014–2024年: kubell（旧Chatwork）テックリード
- 2025年1月: 独立。技術顧問として SaaS 企業を支援
- 関心領域: DDD / 関数型 / 分散システム設計 / AI-DLC

<!--
【1分 / 累計 1:30】30秒で。TAKTとの関わり（takt-sddの開発）に一言触れて本題へ。
-->

---

<!-- _class: single -->

# 今日話すこと

<p class="lead">TAKTが決定論化するのは AI の出力ではなく、実行経路・分岐・証跡・完了判定</p>

- なぜ仕様書駆動開発か — 1回実行（バイブコーディング）だけでは品質保証にならない
- cc-sdd v3 と takt-sdd — 仕様書駆動開発を TAKT workflow として実行する
- TAKTの構成要素 — <code>step / rules / facets / output contract</code> と決定論化
- 生成ステップと read-only 判定ゲートの分離
- <code>kiro-impl</code> — 品質制御を 1 つのワークフローに合成
- <code>kiro-ai-quality-gate</code> — 検出・修正・再計画の閉ループ
- AI駆動開発を設計する 4 つのパターン

<!--
【1分 / 累計 2:30】通底する主張は2つ: (1) TAKTが決定論化するのはAIの出力ではなく実行経路・分岐・証跡・完了判定。(2) takt-sddは、AIエージェントによる開発を閉じた品質ループに載せる実例。この2つを最後のパターン集で回収する。
-->

---

<!-- _class: visual-full -->

# なぜ仕様書駆動開発か — バイブコーディングだけでは品質保証にならない

<svg class="fig" viewBox="0 0 1100 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="開ループ（1回実行を採用）と閉ループ（検出・修正・再検証）の対比">
  <defs>
    <marker id="ar5" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/>
    </marker>
    <marker id="ar5w" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#d9822b"/>
    </marker>
    <marker id="ar5g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#1f9d6b"/>
    </marker>
  </defs>
  <style>
    .p-name { font: 700 20px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; text-anchor: middle; }
    .p-sub  { font: 400 16px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #5b6472; text-anchor: middle; }
    .p-lbl  { font: 400 17px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; }
    .p-flow { stroke: #5b6472; stroke-width: 2; fill: none; marker-end: url(#ar5); }
  
</style>
  <!-- left: open loop -->
  <rect x="30" y="20" width="500" height="380" rx="12" fill="#f5f7fb" stroke="#d5dae3" stroke-width="2"/>
  <text class="p-name" x="280" y="58" fill="#5b6472">バイブコーディング ＝ 1 回の実行をそのまま採用</text>
  <rect x="60" y="110" width="110" height="60" rx="10" fill="#ffffff" stroke="#5b6472" stroke-width="2"/>
  <text class="p-name" x="115" y="147">指示</text>
  <rect x="210" y="110" width="130" height="60" rx="10" fill="#ffffff" stroke="#5b6472" stroke-width="2"/>
  <text class="p-name" x="275" y="147">AI 実行</text>
  <rect x="380" y="110" width="130" height="60" rx="10" fill="#ffffff" stroke="#5b6472" stroke-width="2"/>
  <text class="p-name" x="445" y="147">回答を採用</text>
  <line class="p-flow" x1="170" y1="140" x2="204" y2="140"/>
  <line class="p-flow" x1="340" y1="140" x2="374" y2="140"/>
  <path d="M 275 175 C 320 250 400 250 445 178" stroke="#d9822b" stroke-width="2" stroke-dasharray="6 4" fill="none" marker-end="url(#ar5w)"/>
  <text class="p-lbl" x="230" y="272" fill="#d9822b">受入未達・レビュー漏れも素通り</text>
  <text class="p-sub" x="280" y="322">実行経路は毎回同じとは限らない</text>
  <text class="p-sub" x="280" y="362">検出 → 修正 → 再検証 が設計されていない</text>
  <!-- right: closed loop -->
  <rect x="570" y="20" width="500" height="380" rx="12" fill="#ffffff" stroke="#2f6df0" stroke-width="2.5"/>
  <text class="p-name" x="820" y="58" fill="#2f6df0">検出 → 修正 → 再検証 ＝ 閉ループ</text>
  <text class="p-lbl" x="905" y="100">ゲート通過時のみ</text>
  <rect x="610" y="110" width="130" height="60" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="p-name" x="675" y="147">実行</text>
  <rect x="800" y="110" width="130" height="60" rx="10" fill="#fdf3e7" stroke="#d9822b" stroke-width="2"/>
  <text class="p-name" x="865" y="147">検証ゲート</text>
  <rect x="960" y="110" width="90" height="60" rx="10" fill="#e9f7f1" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="p-name" x="1005" y="147">完了</text>
  <rect x="700" y="270" width="130" height="60" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="p-name" x="765" y="307">修正</text>
  <line class="p-flow" x1="740" y1="140" x2="794" y2="140"/>
  <path d="M 930 140 L 954 140" stroke="#1f9d6b" stroke-width="2.5" fill="none" marker-end="url(#ar5g)"/>
  <path class="p-flow" d="M 865 170 C 865 220 835 244 802 266"/>
  <text class="p-lbl" x="880" y="225">問題あり</text>
  <path class="p-flow" d="M 700 292 C 640 280 660 220 672 176"/>
  <text class="p-lbl" x="652" y="245" text-anchor="end">再検証へ</text>
  <text class="p-sub" x="820" y="362" fill="#2f6df0">必要な回数だけ回る — 完了はゲート通過時のみ</text>
</svg>

<p class="caption">同じ指示でも実行経路は毎回ブレる。必要なのは、必要な回数だけ回る<strong>検出 → 修正 → 再検証</strong>の閉じたループ。TAKTはこれを<strong>ステートマシンとゲート</strong>として設計可能にする。</p>

<!--
【2分 / 累計 4:30】問題はAIが間違えること自体ではない。間違えたときに検出・修正・再検証する閉じたループが「設計されていない」ことが問題。実務ではチャットで1回の回答を採用しがちで、レビュー境界・完了判定・証跡が会話任せになる。次: FYIとして、普段の開発フロー（相談 → grill → cc-sdd 接続）を紹介してから cc-sdd の話へ。
-->

---

<!-- _class: visual-full -->

# FYI: 普段の開発フロー — アイデアを煮詰めてから spec に乗せる

<svg class="fig" viewBox="0 0 1100 350" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="アイデア相談 → grill-me → grill-with-docs → kiro-discovery / kiro-spec-init → cc-sdd フロー">
  <defs>
    <marker id="ar6" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/>
    </marker>
  </defs>
  <style>
    .f-name { font: 700 20px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; text-anchor: middle; }
    .f-sub  { font: 400 15px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #5b6472; text-anchor: middle; }
    .f-art  { font: 400 16px "SFMono-Regular","Menlo",monospace; fill: #2f6df0; text-anchor: middle; }
    .f-lbl  { font: 400 16px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; }
    .f-flow { stroke: #5b6472; stroke-width: 2; fill: none; marker-end: url(#ar6); }
  </style>
  <!-- row 1 -->
  <rect x="30" y="56" width="300" height="96" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="f-name" x="180" y="92">1. アイデアを相談</text>
  <text class="f-sub"  x="180" y="116">新機能・改修どちらでも。</text>
  <text class="f-sub"  x="180" y="136">タスクではなく相談として AI に話す</text>
  <rect x="400" y="56" width="300" height="96" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="f-name" x="550" y="92">2. grill-me スキル</text>
  <text class="f-sub"  x="550" y="116">質問攻めでデシジョンツリーの分岐を</text>
  <text class="f-sub"  x="550" y="136">漏れなく・ダブりなく解消</text>
  <rect x="770" y="56" width="300" height="96" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="f-name" x="920" y="92">3. grill-with-docs スキル</text>
  <text class="f-sub"  x="920" y="116">計画をドメイン用語・既存決定と照合</text>
  <text class="f-sub"  x="920" y="136">決定が固まるたび文書をその場で更新</text>
  <line class="f-flow" x1="330" y1="104" x2="394" y2="104"/>
  <line class="f-flow" x1="700" y1="104" x2="764" y2="104"/>
  <text class="f-art" x="550" y="178">→ plan.md</text>
  <text class="f-art" x="880" y="178">→ CONTEXT.md / adr/</text>
  <!-- down -->
  <path class="f-flow" d="M 1010 152 L 1010 230"/>
  <!-- row 2 (right to left) -->
  <rect x="770" y="236" width="300" height="96" rx="10" fill="#ffffff" stroke="#d9822b" stroke-width="2"/>
  <text class="f-name" x="920" y="272">4. cc-sdd に接続</text>
  <text class="f-sub"  x="920" y="296">/kiro-discovery → /kiro-spec-init</text>
  <text class="f-sub"  x="920" y="316">に plan.md を渡す</text>
  <rect x="400" y="236" width="300" height="96" rx="10" fill="#e9f7f1" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="f-name" x="550" y="272">5. cc-sdd フローで開発</text>
  <text class="f-sub"  x="550" y="296">要件 → 設計 → タスク → 実装 → 検証</text>
  <text class="f-sub"  x="550" y="316">は spec 駆動に任せる</text>
  <line class="f-flow" x1="764" y1="284" x2="706" y2="284"/>
  <!-- point -->
  <text class="f-lbl" x="40" y="270" font-weight="700" fill="#2f6df0">ポイント</text>
  <text class="f-sub" x="40" y="296" style="text-anchor:start">タスクの丸投げではなく、</text>
  <text class="f-sub" x="40" y="316" style="text-anchor:start">相談 → 煮詰める → spec 化の順</text>
  <!-- 前振り annotation -->
  <rect x="388" y="222" width="694" height="124" rx="12" fill="none" stroke="#e0312f" stroke-width="4"/>
  <text x="170" y="206" font-family='"Noto Sans JP","Hiragino Sans",sans-serif' font-size="22" font-weight="700" fill="#e0312f">今日はこのあたりの話です</text>
</svg>

<p class="caption">アイデアの解像度を grill 系スキルで上げ、<code>plan.md</code> と <code>CONTEXT.md / adr/</code> が整ってから spec 駆動のフローに乗せる。grill 系スキルの出典: <code>mattpocock/skills</code></p>

<!--
【1.5分 / 累計 6:00】FYIとして実体験を1分で。grill系スキルはmattpocock/skills製。grill-me=計画について1問ずつ執拗にインタビューし、デシジョンツリーの分岐を1つずつ解消して共通理解に到達するスキル（結果はplan.mdに出力させる運用）。grill-with-docs=その計画を既存のドメインモデル・用語・決定と突き合わせて煮詰め、決定が固まるたびCONTEXT.mdやadr/をその場で更新するスキル。タスク指示から始めず相談から始めるのがポイント。ある程度整ったらkiro-discovery / kiro-spec-initにplan.mdを渡し、以降はcc-sddのフロー。次: そのcc-sddとは何か。
-->

---

<!-- _class: infographic tag-ccsdd -->

# cc-sdd: 承認済み spec を長時間の自律実装に変えるSDDハーネス

<div class="ig-grid">
<div class="ig-card hero">
<h3>何をするものか</h3>
<p><code>npx cc-sdd@latest</code> の一発で、エージェント型の SDLC ワークフロー（discovery → 要件 → 設計 → タスク → 自律実装）を <strong>Agent Skills</strong> として導入する。</p>
<p class="mut">Kiro-inspired — 既存の Kiro spec（<code>.kiro/specs/</code>）と互換でポータブル。</p>
</div>
<div class="ig-card hero">
<h3>思想 — spec は「契約」</h3>
<p>spec はエージェントへの命令書ではなく、<strong>システムの部分間の契約</strong>。コードが SSoT。</p>
<p>エージェントが spec を書き、人間は <strong>フェーズゲート（各フェーズ完了時の関門）で契約を承認</strong>し、出荷されるのはコード。明示された境界（boundary）が、人間とエージェントの並行作業を可能にする。</p>
</div>
<div class="ig-card hero">
<h3>プロジェクト</h3>
<p>
<span class="chip st">v3.0.2 — 2026/04</span>
<span class="chip">MIT</span>
<span class="chip">★ 3.4k</span>
</p>
<p>gotalab/cc-sdd — 13 言語対応（<code>--lang ja</code>）。</p>
<p class="mut">takt-sdd はこの cc-sdd を pinned <code>cc-sdd@3.0.2</code> で初期化し、TAKT workflow として包む。</p>
</div>
</div>

<p class="closing">次: v3 の全体像 — discovery から spec 生成・自律実装までの 3 フェーズを 1 枚で。</p>

<!--
【1.5分 / 累計 7:30】出典はgotalab/cc-sdd README（v3.0.2）。キャッチは「Turn approved specs into long-running autonomous implementation」。哲学（why-cc-sdd）: specを部分間の契約として扱い、境界が内側の自由と外側の保護を両立する、という賭け。1分で流して次の詳細ページへ。
-->

---

<!-- _class: infographic tag-ccsdd -->

# cc-sdd: AIエージェントによる自律的な仕様書駆動開発

<div class="ig-grid">
<div class="ig-card hero">
<h3>1. 探索・振り分け</h3>
<p><code>/kiro-discovery</code> を起点に、既存 spec の拡張 / 新規 spec 作成 / spec なし直接実装 / 複数 spec への分解 を判断。</p>
<p>要求の大きさに応じて出力が分かれる — 単一機能なら <code>brief.md</code> 1 つ、複数 spec への分解なら <code>roadmap.md</code> + 複数の <code>brief.md</code>。</p>
</div>
<div class="ig-card hero">
<h3>2. 仕様策定</h3>
<p>要件定義（EARS 形式）→ 設計（Mermaid 図 + File Structure Plan）→ タスク分割の 3 段階を経て、実装の「契約」を固める。</p>
<svg viewBox="0 0 300 112" width="300" height="112" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="EARS 形式: WHEN トリガー、システム SHALL 応答" style="display:block;margin:4px 0 0 0">
  <g font-family='"Noto Sans JP","Hiragino Sans",sans-serif'>
    <text x="2" y="13" font-size="12.5" font-weight="700" fill="#2f6df0">EARS ＝ 要件を定型構文で書く</text>
    <rect x="2" y="22" width="120" height="30" rx="6" fill="#eaf1fe" stroke="#2f6df0" stroke-width="1.5"/>
    <text x="62" y="41" font-size="12" fill="#1d2330" text-anchor="middle">WHEN 〈トリガー〉</text>
    <line x1="126" y1="37" x2="136" y2="37" stroke="#5b6472" stroke-width="1.5"/>
    <path d="M136,33 L142,37 L136,41 z" fill="#5b6472"/>
    <rect x="144" y="22" width="154" height="30" rx="6" fill="#fdf3e7" stroke="#d9822b" stroke-width="1.5"/>
    <text x="221" y="41" font-size="12" fill="#1d2330" text-anchor="middle">システム SHALL 〈応答〉</text>
    <text x="2" y="71" font-size="10.5" fill="#5b6472">英: WHEN balance is low, THE system SHALL reject payment</text>
    <text x="2" y="88" font-size="11" fill="#5b6472">日: 残高不足のとき、システムは決済を拒否すること</text>
    <text x="2" y="106" font-size="11" fill="#5b6472">変種: WHILE（状態）/ IF…THEN（異常）/ WHERE（範囲）</text>
  </g>
</svg>
</div>
<div class="ig-card hero">
<h3>3. 自律実装</h3>
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
</div>
</div>

<!--
【1.5分 / 累計 9:00】cc-sdd v3そのものの1枚要約。出典はcc-sdd README v3.0: discoveryの振り分け（拡張/新規/直接実装/分解、brief.md・roadmap.md）、EARS+受入基準、design.mdのMermaid+File Structure Plan、tasks.mdのBoundary/Depends注記、kiro-implのタスクごとfresh implementer+TDD(RED→GREEN, feature flag配下)+独立レビュアー+auto-debug（blockedまたは2回否決で発動）、8エージェント×17スキル（Claude Code/Codex stable、他beta）。ここは1分半で流し、「この流れをtakt-sddはTAKT workflowとして制御する」へ繋ぐ。次のスライドでフロー全体をkiro:*の実行順として見る。
-->

---

<!-- _class: visual-full tag-ccsdd -->

# cc-sdd / Kiro-style SDDは仕様生成から実装・検証へ進む

<svg class="fig" viewBox="0 0 1100 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="cc-sdd v3 / Kiro-style SDD の基本フロー">
  <defs>
    <marker id="ar1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/>
    </marker>
  </defs>
  <style>
    .box { fill: #ffffff; stroke: #2f6df0; stroke-width: 2; rx: 10; }
    .gate { fill: #fdf3e7; stroke: #d9822b; stroke-width: 2; }
    .name { font: 700 21px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; text-anchor: middle; }
    .sub  { font: 400 16px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #5b6472; text-anchor: middle; }
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
  <text x="685" y="88" style="font:700 18px &quot;Noto Sans JP&quot;,&quot;Hiragino Sans&quot;,sans-serif" fill="#1d2330" text-anchor="middle">kiro-spec-requirements</text>
  <text class="sub"  x="685" y="112">EARS 形式の要件</text>
  <rect class="box" x="840" y="60" width="230" height="64" rx="10"/>
  <text class="name" x="955" y="88">kiro-spec-design</text>
  <text class="sub"  x="955" y="112">技術設計 + 発見ログ</text>
  <text class="art" x="685" y="46">requirements.md</text>
  <text class="art" x="955" y="46">design.md / research.md</text>
  <line class="flow" x1="260" y1="92" x2="294" y2="92"/>
  <line class="flow" x1="530" y1="92" x2="564" y2="92"/>
  <line class="flow" x1="800" y1="92" x2="834" y2="92"/>
  <!-- optional gap validation (既存実装がある場合) -->
  <path class="flow" d="M 685 124 L 685 154" stroke-dasharray="6 4"/>
  <rect class="box gate" x="570" y="160" width="230" height="60" rx="10" stroke-dasharray="6 4"/>
  <text class="name" x="685" y="186">kiro-validate-gap</text>
  <text class="sub"  x="685" y="210">既存実装とのギャップ分析</text>
  <path class="flow" d="M 800 190 C 845 190 875 165 888 130" stroke-dasharray="6 4"/>
  <text class="art" x="685" y="242">research.md 更新</text>
  <!-- down -->
  <path class="flow" d="M 955 124 L 955 246"/>
  <!-- row 2 (right to left) -->
  <rect class="box gate" x="840" y="252" width="230" height="64" rx="10"/>
  <text class="name" x="955" y="280">kiro-validate-design</text>
  <text class="sub"  x="955" y="304">read-only / GO・NO-GO</text>
  <rect class="box" x="570" y="252" width="230" height="64" rx="10"/>
  <text class="name" x="685" y="280">kiro-spec-tasks</text>
  <text class="sub"  x="685" y="304">実装タスク生成</text>
  <rect class="box" x="300" y="252" width="230" height="64" rx="10"/>
  <text class="name" x="415" y="280">kiro-impl</text>
  <text class="sub"  x="415" y="304">ゲート付き実装</text>
  <rect class="box gate" x="30"  y="252" width="230" height="64" rx="10"/>
  <text class="name" x="145" y="280">kiro-validate-impl</text>
  <text class="sub"  x="145" y="304">read-only / 最終検証</text>
  <text class="art" x="955" y="340">design-review.md</text>
  <text class="art" x="685" y="340">tasks.md</text>
  <text class="art" x="415" y="340">tasks.md 進捗更新</text>
  <line class="flow" x1="834" y1="284" x2="806" y2="284"/>
  <line class="flow" x1="564" y1="284" x2="536" y2="284"/>
  <line class="flow" x1="294" y1="284" x2="266" y2="284"/>
  <!-- artifacts strip -->
  <rect x="30" y="400" width="1040" height="80" rx="10" fill="#f5f7fb" stroke="#d5dae3" stroke-width="1.5"/>
  <text class="name" x="550" y="434">成果物はすべて <tspan fill="#2f6df0" font-family="Menlo,monospace">.kiro/specs/{feature}/</tspan> に蓄積</text>
  <text class="sub"  x="550" y="462">Kiro の仕様フォーマットと互換 — gap 分析の発見は research.md に追記される</text>
</svg>

<p class="caption">discovery から spec 生成・design validation・tasks・実装・final validation へ。成果物は <code>.kiro/specs/{feature}/</code> に蓄積され、Kiro と互換。</p>

<!--
【1.5分 / 累計 10:30】cc-sddの一般紹介には寄せない。前提の確認だけ: 要件(EARS) → 設計 → タスク → 実装をspec artifact中心に進め、takt-sddはpinned cc-sdd@3.0.2で初期化し、この流れ全体をkiro:* npm scriptsからTAKT workflowとして実行する。既存コードがある場合はrequirementsの後にkiro-validate-gapも挟める。次: この流れを TAKT workflow として実行する takt-sdd へ。
-->

---

<!-- _class: infographic tag-sdd layers -->

# takt-sdd: taktの上でcc-sdd / OpenSpecを動かすワークフロー資産

<div class="ig-grid">
<div class="ig-card hero">
<h3>何をするものか</h3>
<p>SDD の全フロー（要件 → 設計 → タスク → 実装 → 検証）を takt の workflow（YAML）+ facets で自動化する定義集。</p>
<p>成果物は <code>.kiro/specs/{feature}/</code> に出力され、<strong>Kiro 互換</strong>で併用できる。</p>
</div>
<div class="ig-card hero">
<h3>提供するワークフロー</h3>
<ul>
<li><code>kiro:*</code> — cc-sdd 互換の spec 駆動フロー一式（生成 step + 検証ゲート群）</li>
<li><code>opsx:*</code> — OpenSpec の change 管理（propose → apply → archive）</li>
<li>steering — <code>.kiro/steering/</code> をプロジェクトメモリとして生成・同期</li>
</ul>
</div>
<div class="ig-card hero">
<h3>導入とステータス</h3>
<p><code>npx create-takt-sdd</code> の一発で <code>.takt/</code> と npm scripts を導入（<code>--lang ja</code> 対応）。</p>
<p>
<span class="chip st">cc-sdd v3 対応完了</span>
<span class="chip bt">リリース準備中</span>
</p>
<p class="mut">MIT / Apache-2.0<br/>github.com/j5ik2o/takt-sdd</p>
</div>
</div>

<svg viewBox="0 0 1100 196" width="1176" height="210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="レイヤー構造: 上から AI エージェント、cc-sdd、takt-sdd、TAKT" style="display:block;margin:26px 0 10px 0;flex:0 0 auto">
  <defs>
    <clipPath id="lyclip"><rect x="20" y="2" width="1060" height="192" rx="12"/></clipPath>
  </defs>
  <g font-family='"Noto Sans JP","Hiragino Sans",sans-serif' clip-path="url(#lyclip)">
    <rect x="20" y="2" width="1060" height="48" fill="#f5f7fb"/>
    <text x="44" y="33" font-size="19" font-weight="700" fill="#1d2330">AI エージェント</text>
    <text x="230" y="32" font-size="14" fill="#5b6472">Claude Code / Codex など — コード・成果物を実際に書く</text>
    <rect x="972" y="13" width="84" height="26" rx="13" fill="#ffffff" stroke="#5b6472"/>
    <text x="1014" y="31" font-size="13" font-weight="600" text-anchor="middle" fill="#5b6472">実作業</text>
    <rect x="20" y="50" width="1060" height="48" fill="#fdf3e7"/>
    <text x="44" y="81" font-size="19" font-weight="700" fill="#1d2330">cc-sdd</text>
    <text x="230" y="80" font-size="14" fill="#5b6472">SDD の手法定義 — スキル・プロセスの定義情報のみで、それ自体は動かない</text>
    <rect x="972" y="61" width="84" height="26" rx="13" fill="#ffffff" stroke="#d9822b"/>
    <text x="1014" y="79" font-size="13" font-weight="600" text-anchor="middle" fill="#d9822b">定義</text>
    <rect x="20" y="98" width="1060" height="48" fill="#e9f7f1"/>
    <text x="44" y="129" font-size="19" font-weight="700" fill="#1d2330">takt-sdd</text>
    <text x="230" y="128" font-size="14" fill="#5b6472">workflow + facets の定義資産 — cc-sdd のプロセスを TAKT で実行できる形に定義</text>
    <rect x="972" y="109" width="84" height="26" rx="13" fill="#ffffff" stroke="#1f9d6b"/>
    <text x="1014" y="127" font-size="13" font-weight="600" text-anchor="middle" fill="#1f9d6b">定義</text>
    <rect x="20" y="146" width="1060" height="48" fill="#eaf1fe"/>
    <text x="44" y="177" font-size="19" font-weight="700" fill="#1d2330">TAKT</text>
    <text x="230" y="176" font-size="14" fill="#5b6472">プロセスマネージャー — 定義を読んで step 実行・分岐・完了判定を管理する実行体</text>
    <rect x="972" y="157" width="84" height="26" rx="13" fill="#ffffff" stroke="#2f6df0"/>
    <text x="1014" y="175" font-size="13" font-weight="600" text-anchor="middle" fill="#2f6df0">実行・管理</text>
    <line x1="20" y1="50" x2="1080" y2="50" stroke="#ffffff" stroke-width="2.5"/>
    <line x1="20" y1="98" x2="1080" y2="98" stroke="#ffffff" stroke-width="2.5"/>
    <line x1="20" y1="146" x2="1080" y2="146" stroke="#ffffff" stroke-width="2.5"/>
  </g>
  <rect x="20" y="2" width="1060" height="192" rx="12" fill="none" stroke="#5b6472" stroke-width="2"/>
</svg>

<p class="closing">以降は takt-sdd を実例に、TAKT でAI駆動開発のワークフローを設計するノウハウを見ていく。</p>

<!--
【2分 / 累計 12:30】takt-sddの位置づけを1分で。taktはエンジン、takt-sddはその上のworkflow定義資産（cc-sdd互換のkiro:*とOpenSpec互換のopsx:*、steering）。Kiroの.kiro/specs/フォーマットと互換なので既存のKiro/cc-sdd資産と併用できる。cc-sdd v3対応はmainに入っておりリリース準備中（公開READMEの表記は旧namingの場合あり）。ここから先はtakt-sddを実例としてTAKTのノウハウに入る。
-->

---

<!-- _class: visual-full dual -->

# takt-sddではどのstepを・どの条件で・どの証跡で次へ進めるかを固定する

<div class="dualbadge"><span class="b-takt">TAKT</span><span class="b-sdd">takt-sdd</span></div>

<svg class="fig" viewBox="0 0 1100 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TAKT の構成要素: workflow YAML が steps / rules / facets / output contracts / loop_monitors / workflow_call を束ねる">
  <defs>
    <marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/>
    </marker>
  </defs>
  <style>
    .a-name { font: 700 20px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; text-anchor: middle; }
    .a-sub  { font: 400 15px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #5b6472; text-anchor: middle; }
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
  <g font-family='"Noto Sans JP","Hiragino Sans",sans-serif' font-size="16" text-anchor="middle">
    <rect x="280" y="272" width="83" height="34" rx="17" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="322" y="294" fill="#1d2330">Persona</text>
    <rect x="372" y="272" width="67" height="34" rx="17" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="406" y="294" fill="#1d2330">Policy</text>
    <rect x="448" y="272" width="104" height="34" rx="17" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="500" y="294" fill="#1d2330">Instruction</text>
    <rect x="561" y="272" width="106" height="34" rx="17" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="614" y="294" fill="#1d2330">Knowledge</text>
    <rect x="676" y="272" width="144" height="34" rx="17" fill="#fdf3e7" stroke="#d9822b"/>
    <text x="748" y="294" fill="#1d2330">Output Contract</text>
  </g>
  <!-- contracts / monitors / call -->
  <rect x="275" y="355" width="250" height="90" rx="8" fill="#fdf3e7" stroke="#d9822b" stroke-width="1.8"/>
  <text class="a-name" x="400" y="388">output contracts</text>
  <text class="a-sub"  x="400" y="412">STATUS / VERDICT / 証跡</text>
  <text class="a-sub"  x="400" y="432">→ rules が機械的に評価</text>
  <rect x="540" y="355" width="160" height="90" rx="8" fill="#ffffff" stroke="#d9822b" stroke-width="1.8" stroke-dasharray="6 4"/>
  <text class="a-name" x="620" y="388">loop_monitors</text>
  <text class="a-sub"  x="620" y="412">反復を監視し</text>
  <text class="a-sub"  x="620" y="432">閾値で介入</text>
  <rect x="715" y="355" width="110" height="90" rx="8" fill="#ffffff" stroke="#1f9d6b" stroke-width="1.8"/>
  <text class="a-name" x="770" y="384">workflow</text>
  <text class="a-name" x="770" y="408">_call</text>
  <text class="a-sub"  x="770" y="432">合成</text>
  <!-- 出力 -->
  <line class="a-flow" x1="845" y1="230" x2="883" y2="230"/>
  <rect x="890" y="105" width="190" height="120" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="a-name" x="985" y="140">spec artifacts</text>
  <text class="a-mono" x="985" y="168">.kiro/specs/</text>
  <text class="a-sub"  x="985" y="194">requirements / design</text>
  <text class="a-sub"  x="985" y="214">/ tasks</text>
  <rect x="890" y="255" width="190" height="120" rx="10" fill="#ffffff" stroke="#1f9d6b" stroke-width="2"/>
  <text class="a-name" x="985" y="292">証跡（evidence）</text>
  <text class="a-sub"  x="985" y="320">validation / review の</text>
  <text class="a-sub"  x="985" y="340">判定根拠・証跡</text>
</svg>

<p class="caption">workflow（YAML）が steps・rules・facets・output contracts・loop_monitors・workflow_call を束ね、spec artifacts と証跡へ落とす。</p>

<!--
【2分 / 累計 14:30】読み方: 入口はkiro:* npm scripts（安定したsurface）。中身はTAKTのworkflow YAML。stepが実行単位で、各stepにはfacetsで組んだプロンプトが与えられ、出力はoutput contractで定型化され、rulesがそのフィールドを読んで次のstepを決める。loop_monitorsが反復を監視し、workflow_callで別workflowをサブルーチンとして合成できる。結果は.kiro/specs/のartifactとvalidation/reviewの証跡。次: この部品群で何を固定し、何をAIに残すかを整理する。
-->

---

<!-- _class: compare-2col dual -->

# TAKTはAI出力ではなく、実行制御面を決定論化する

<div class="dualbadge"><span class="b-imp">重要</span><span class="b-takt">TAKT</span></div>

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
- 完了判定 — 検証ゲートを通過したときだけ

</div>
</div>

<!--
【2分 / 累計 16:30】ここが今日の中心テーゼ。TAKTは「AIの回答を固定する」道具ではなく、「どのstepを、どの条件で、どの証跡をもって次へ進めるか」を固定する。自由会話ではなくステートマシンとしてworkflowが進む。登場人物は前スライドの地図のとおり。次はfacetとoutput contractをYAML実例で掘る。
-->

---

<!-- _class: code-2col tag-takt -->

# facets で部品化し、output contract で出力を定型化する

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

- **facets** — プロンプトをモノリスにせず、5 つの関心事 <code>Persona / Policy / Instruction / Knowledge / Output Contract</code> に部品化
- 同じ facet を複数 step・workflow に差し込んで**再利用**できる。ビルトイン facet に自作を足して**差分カスタム**も簡単
- **output contract** — AI の非定型な出力を <code>STATUS</code>・<code>VERDICT</code>・証跡の定型出力に変換させ、rules が自由文の印象ではなく **contract のフィールド**で機械的に次の step を決められるようにする

</div>
</div>

<!--
【2分 / 累計 18:30】2本柱で話す。柱1=facetsのモジュール化: 同じpolicy/knowledge/personaを複数step・複数workflowに差し込んで再利用し、重複を排除する。ビルトインfacetを参照して差分だけ足すカスタムも容易（kiro-ai-quality-gateがparamsでfix_instruction / domain_knowledgeを差し替えて3文脈で使い回されるのが好例）。柱2=output contract: これがないと「次へ進んでいいか」の判断がAIの自由文をAIが解釈する伝言ゲームになる。contractがあるからrulesが決定論的に評価できる。次: 生成stepと判定stepの権限分離。
-->

---

<!-- _class: compare-2col tag-sdd -->

# 同じワークフロー内でも、生成ステップと判定ステップの権限を分離する

<p class="lead">生成と検証を同じ step に混ぜると「作った本人が通した」になる。分けるのは呼び出しではなく権限と役割。</p>

<div class="cols">
<div class="card ok">

## 生成 step（<code>edit: true</code>）

- <code>kiro-spec-requirements</code> / <code>kiro-spec-design</code> / <code>kiro-spec-tasks</code> の生成 step
- <code>kiro-impl</code> の <code>execute-task</code> / <code>update-progress</code>
- spec・コードなどの artifact を作成・更新する

</div>
<div class="card ok">

## 判定 step（read-only）

- <code>kiro-validate-gap</code> / <code>kiro-validate-design</code>（GO / NO-GO）/ <code>kiro-validate-impl</code>
- <code>kiro-impl</code> の reviewers / <code>verify-task-completion</code>
- <code>edit: false</code> + readonly 権限 — artifact を直さず、不足証跡・manual check を返す

</div>
</div>

<p class="caption">判定スキルは生成ワークフローの step として起動される — 例: <code>kiro-spec-design</code> 内で validate-design が、<code>kiro-impl</code> 内で <code>validate-impl-final</code> が動く。同じワークフローに同居しても、判定 step は read-only に固定される。</p>

<!--
【2分 / 累計 20:30】誤解されやすい点を明確に: validate系は別workflowに隔離されているのではなく、生成workflowのstepとして起動される（kiro-spec-design → validate-design、kiro-impl → validate-impl-final）。分離の実体はstep単位の権限と役割: 判定stepはedit: false + readonly permission + 別personaで、artifactを修正せずGO/NO-GO・不足証跡・manual checkを返すだけ。「検証不能な項目を成功扱いにしない」が原則で、成功の根拠が常に明示される。次: 生成・判定・debug を1つに合成した kiro-impl の全体像へ。
-->

---

<!-- _class: visual-full dual -->

# `kiro-impl` は実装から最終検証までを1つのワークフローで制御する

<div class="dualbadge"><span class="b-imp">重要</span><span class="b-sdd">takt-sdd</span></div>

<svg class="fig" viewBox="0 0 1100 550" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="kiro-impl の制御フロー: plan-one-task から validate-impl-final まで">
  <defs>
    <marker id="ar3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#5b6472"/>
    </marker>
  </defs>
  <style>
    .i-name { font: 700 20px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; text-anchor: middle; }
    .i-sub  { font: 400 15px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #5b6472; text-anchor: middle; }
    .i-lbl  { font: 400 16px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; }
    .i-flow { stroke: #5b6472; stroke-width: 2; fill: none; marker-end: url(#ar3); }
  
</style>
  <!-- row 1 -->
  <rect x="30" y="40" width="180" height="80" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="i-name" x="120" y="66">plan-one-task</text>
  <text class="i-sub"  x="120" y="88">persona: planner</text>
  <text class="i-sub"  x="120" y="106">着手可能な task を選ぶ</text>
  <rect x="250" y="40" width="180" height="80" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="i-name" x="340" y="66">execute-task</text>
  <text class="i-sub"  x="340" y="88">persona: coder</text>
  <text class="i-sub"  x="340" y="106">選んだ task を実装</text>
  <rect x="470" y="40" width="210" height="80" rx="10" fill="#eaf1fe" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="i-name" x="575" y="68">workflow_call</text>
  <text class="i-sub"  x="575" y="90">kiro-ai-quality-gate</text>
  <text class="i-sub"  x="575" y="109">subworkflow として合成</text>
  <rect x="720" y="40" width="350" height="170" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="i-name" x="895" y="72">reviewers — parallel 4 観点</text>
  <g font-family='"Noto Sans JP","Hiragino Sans",sans-serif' font-size="16" text-anchor="middle">
    <rect x="740" y="90" width="150" height="40" rx="8" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="815" y="115" fill="#1d2330">coding</text>
    <rect x="905" y="90" width="150" height="40" rx="8" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="980" y="115" fill="#1d2330">architecture</text>
    <rect x="740" y="142" width="150" height="40" rx="8" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="815" y="167" fill="#1d2330">QA</text>
    <rect x="905" y="142" width="150" height="40" rx="8" fill="#eaf1fe" stroke="#2f6df0"/>
    <text x="980" y="167" fill="#1d2330">testing</text>
  </g>
  <line class="i-flow" x1="210" y1="80" x2="244" y2="80"/>
  <line class="i-flow" x1="430" y1="80" x2="464" y2="80"/>
  <line class="i-flow" x1="680" y1="80" x2="714" y2="80"/>
  <!-- row 2: debug-task / verify-task-completion -->
  <rect x="470" y="280" width="210" height="80" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="i-name" x="575" y="306">debug-task</text>
  <text class="i-sub"  x="575" y="328">persona: supervisor</text>
  <text class="i-sub"  x="575" y="346">分岐を判定</text>
  <rect x="770" y="280" width="270" height="80" rx="10" fill="#ffffff" stroke="#1f9d6b" stroke-width="2"/>
  <text class="i-name" x="905" y="306" font-size="19">verify-task-completion</text>
  <text class="i-sub"  x="905" y="328">persona: supervisor</text>
  <text class="i-sub"  x="905" y="346">証跡を確認して完了判定</text>
  <!-- gate need_replan → debug -->
  <path class="i-flow" d="M 575 120 L 575 274"/>
  <text class="i-lbl" x="588" y="205">need_replan</text>
  <!-- reviewers needs_fix → debug -->
  <path class="i-flow" d="M 790 210 C 770 250 730 280 690 297"/>
  <text class="i-lbl" x="632" y="248">any(needs_fix)</text>
  <!-- reviewers approved → verify -->
  <path class="i-flow" d="M 905 210 L 905 274"/>
  <text class="i-lbl" x="918" y="250">all(&quot;approved&quot;)</text>
  <!-- debug RETRY_TASK → execute -->
  <path class="i-flow" d="M 466 305 C 380 290 345 215 341 126"/>
  <text class="i-lbl" x="335" y="225" text-anchor="end">RETRY_TASK</text>
  <!-- verify NOT_VERIFIED → debug -->
  <path class="i-flow" d="M 764 316 L 686 316"/>
  <text class="i-lbl" x="725" y="292" text-anchor="middle">NOT_</text>
  <text class="i-lbl" x="725" y="306" text-anchor="middle">VERIFIED</text>
  <!-- row 3: update-progress / validate-impl-final -->
  <rect x="470" y="440" width="210" height="80" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="i-name" x="575" y="466">update-progress</text>
  <text class="i-sub"  x="575" y="488">persona: coder</text>
  <text class="i-sub"  x="575" y="506">tasks.md の進捗を更新</text>
  <rect x="790" y="440" width="250" height="80" rx="10" fill="#e9f7f1" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="i-name" x="915" y="466">validate-impl-final</text>
  <text class="i-sub"  x="915" y="488">persona: supervisor</text>
  <text class="i-sub"  x="915" y="506">read-only / GO → COMPLETE</text>
  <!-- debug block/stop → update -->
  <path class="i-flow" d="M 575 360 L 575 434"/>
  <text class="i-lbl" x="588" y="402">block / stop</text>
  <!-- verify VERIFIED → update -->
  <path class="i-flow" d="M 905 360 C 900 405 720 415 624 436"/>
  <text class="i-lbl" x="915" y="405">VERIFIED</text>
  <!-- update → validate (all complete) -->
  <line class="i-flow" x1="684" y1="480" x2="784" y2="480"/>
  <text class="i-lbl" x="692" y="470">全 task 完了</text>
  <!-- update → plan (remaining tasks) -->
  <path class="i-flow" d="M 466 480 L 120 480 L 120 126"/>
  <text class="i-lbl" x="132" y="330">残 task あり → 次の task</text>
  <!-- loop monitors -->
  <rect x="160" y="370" width="300" height="100" rx="10" fill="#fffdf9" stroke="#d9822b" stroke-width="2" stroke-dasharray="6 4"/>
  <text class="i-name" x="310" y="396">loop_monitors</text>
  <text class="i-sub"  x="310" y="418">execute ⇄ debug / review の循環を監視</text>
  <text class="i-sub"  x="310" y="437">threshold 2 で supervisor が健全性を判定</text>
  <text class="i-sub"  x="310" y="456">非生産的なら update-progress へ</text>
</svg>

<p class="caption"><code>kiro-impl</code> は 1 task ずつ、AI 品質ゲート（subworkflow）・4 観点並列 review・supervisor による debug 分岐・completion verification・進捗更新を全 task 完了まで反復し、最後に read-only の final validation を通る。</p>

<!--
【3分 / 累計 23:30】TAKTが「手順の自動化」ではなく「品質制御の合成」である例。(1) plan-one-taskが着手可能（eligible）なtaskを1つだけ選ぶ＝one-task iteration。(2) execute-task後、AI品質ゲートをworkflow_callでsubworkflowとして呼ぶ（need_replanはdebug-task行き）。(3) coding / architecture / QA / testing の4観点reviewをparallelで走らせ、all("approved")でverifyへ、any(needs_fix)はdebug-taskへ。(4) debug-taskはsupervisorがRETRY_TASK（execute-taskへ再試行）かblock/stop（update-progressへ）を判定する。「fix」専用stepはなく、修正は常にexecute-taskの再実行。(5) verify-task-completionで証跡を確認し、update-progressがtasks.mdを更新。残taskがあればplan-one-taskへ戻り、全task完了でread-onlyのvalidate-impl-final（GO→COMPLETE）。loop_monitorsはexecute⇄debug系の循環をthreshold 2で監視し、非生産的ならupdate-progressへ落とす。workflow_callで呼んでいるAI品質ゲートの中身は次のスライドで開く。
-->

---

<!-- _class: visual-full tag-sdd -->

# `kiro-ai-quality-gate` は検出・修正・再計画の分岐でループを閉じる

<svg class="fig" viewBox="0 0 1100 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AI 品質ゲートの閉ループ: review から COMPLETE / fix / need_replan への分岐">
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
    .g-name { font: 700 21px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; text-anchor: middle; }
    .g-sub  { font: 400 16px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #5b6472; text-anchor: middle; }
    .g-lbl  { font: 400 17px "Noto Sans JP","Hiragino Sans",sans-serif; fill: #1d2330; }
    .g-flow { stroke: #5b6472; stroke-width: 2; fill: none; marker-end: url(#ar4); }
  
</style>
  <!-- review -->
  <rect x="60" y="160" width="240" height="90" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2.5"/>
  <text class="g-name" x="180" y="192">review</text>
  <text class="g-sub"  x="180" y="216" style="font-size:14px">persona: ai-antipattern-reviewer</text>
  <text class="g-sub"  x="180" y="238">AI 固有の問題を検出</text>
  <!-- COMPLETE -->
  <path d="M 300 185 C 480 110 640 95 818 95" stroke="#1f9d6b" stroke-width="2.5" fill="none" marker-end="url(#ar4g)"/>
  <text class="g-lbl" x="390" y="100">AI 固有の問題なし</text>
  <rect x="825" y="60" width="220" height="70" rx="10" fill="#e9f7f1" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="g-name" x="935" y="103">COMPLETE</text>
  <!-- fix loop -->
  <path class="g-flow" d="M 280 250 C 350 320 420 345 488 352"/>
  <text class="g-lbl" x="305" y="330">問題あり</text>
  <rect x="495" y="320" width="180" height="70" rx="10" fill="#ffffff" stroke="#2f6df0" stroke-width="2"/>
  <text class="g-name" x="585" y="344">fix</text>
  <text class="g-sub"  x="585" y="364">persona: coder</text>
  <text class="g-sub"  x="585" y="382">指摘を修正</text>
  <path class="g-flow" d="M 510 320 C 400 270 330 250 306 235"/>
  <text class="g-lbl" x="365" y="252">FIXED → 再 review</text>
  <!-- fix NO_FIX_NEEDED → COMPLETE -->
  <path d="M 675 355 L 1075 355 L 1075 95 L 1051 95" stroke="#1f9d6b" stroke-width="2" fill="none" marker-end="url(#ar4g)"/>
  <text class="g-lbl" x="690" y="378">NO_FIX_NEEDED（証跡必須）</text>
  <!-- fix BLOCKED → need_replan -->
  <path d="M 675 328 C 750 320 790 314 819 304" stroke="#d9822b" stroke-width="2" fill="none" marker-end="url(#ar4w)"/>
  <text class="g-lbl" x="815" y="298" text-anchor="end">NEED_REPLAN / BLOCKED</text>
  <!-- need_replan -->
  <path d="M 300 220 C 520 230 640 245 818 268" stroke="#d9822b" stroke-width="2.5" fill="none" marker-end="url(#ar4w)"/>
  <text class="g-lbl" x="430" y="218">ambiguous / blocked / 内部矛盾</text>
  <rect x="825" y="240" width="220" height="70" rx="10" fill="#fdf3e7" stroke="#d9822b" stroke-width="2.5"/>
  <text class="g-name" x="935" y="264">need_replan</text>
  <text class="g-sub"  x="935" y="284">persona: supervisor</text>
  <text class="g-sub"  x="935" y="302">caller に返して計画へ戻す</text>
  <!-- loop monitor -->
  <rect x="495" y="20" width="250" height="64" rx="10" fill="#ffffff" stroke="#d9822b" stroke-width="2" stroke-dasharray="6 4"/>
  <text class="g-name" x="620" y="40">loop_monitors</text>
  <text class="g-sub"  x="620" y="60">judge persona: supervisor</text>
  <text class="g-sub"  x="620" y="78">review ⇄ fix の反復を監視</text>
  <path d="M 745 60 C 800 90 830 150 845 232" stroke="#d9822b" stroke-width="2" stroke-dasharray="6 4" fill="none" marker-end="url(#ar4w)"/>
  <text class="g-lbl" x="852" y="155">threshold 3 で判定</text>
</svg>

<p class="caption">検出例: hallucinated path / API、scope mismatch、unsupported claim、unused artifact。ゲートの本質は検出項目数ではなく <code>fix / need_replan</code> への<strong>分岐</strong>にある。COMPLETE には証跡が必須。</p>

<!--
【2.5分 / 累計 26:00】AI固有のアンチパターン（存在しないAPIやpathの参照、タスク範囲とのずれ、根拠のない主張、使われない生成物）を専用reviewerが検出する。このゲートはcallableなsubworkflowで、fix_instruction / domain_knowledgeをparamsとして受け取り、need_replanを戻り値としてcallerへ返す。流れ: reviewで問題なければCOMPLETE、問題があればfixへ。fixはFIXEDなら再review、NO_FIX_NEEDEDはfinding単位の証跡がある場合だけCOMPLETE、BLOCKED/NEED_REPLANならreplanへ。reviewの判定が曖昧・ブロック・内部矛盾の場合もreplan行き（フォールバックルール）。loop_monitorsはreview⇄fixをthreshold 3で監視し、supervisorが非生産的と判定すればrequest-replanへエスカレーション。「1回の回答を採用する」使い方との決定的な違い。これが前のスライドのkiro-implがworkflow_callで呼んでいた部品の中身（kiro-impl側ではneed_replanをdebug-taskが受ける）。次: 4つのパターンで一般化して締め。
-->

---

<!-- _class: single tag-takt -->

# まとめ

<p class="lead">TAKTから学ぶ、AI駆動開発をワークフローとして設計する4つのパターン</p>

<div class="pat-grid">
<div class="ig-card pat">
<h3>1. 作業を分解する</h3>
<p>AI作業を <code>step + rule + contract</code> に分解する。プロンプトへの依存を減らす。</p>
</div>
<div class="ig-card pat">
<h3>2. 関心事を分離する</h3>
<p>状態変更 workflow と read-only validation を厳格に分ける。自己承認を防ぐ。</p>
</div>
<div class="ig-card pat">
<h3>3. 分岐を設計する</h3>
<p>AI 品質ゲートは検出だけでなく、<code>fix</code> と <code>replan</code> の分岐を持つ。閉じたループを作る。</p>
</div>
<div class="ig-card pat">
<h3>4. 上限を強制する</h3>
<p><code>parallel review</code> と <code>loop monitor</code> で、レビュー漏れや未収束（無限ループ）を強制遮断する。</p>
</div>
</div>

<p class="closing">cc-sdd v3 をこの形で包むことで、工数削減と品質向上を同時に実現する。<br/>AI駆動開発をプロンプトではなく<strong>「ワークフローと契約」</strong>として設計する。</p>

<!--
【1.5分 / 累計 27:30】締め: takt-sddは単なるcc-sddラッパーではなく、AI駆動開発を閉じた品質ループとして運用する実例。今日の価値はすでに実体化している品質制御にある（workflow YAMLとkiro:* surfaceが根拠）。導入はnpx create-takt-sddの一発で、CLI導線の整備は今後の話として一言だけ。最後はご清聴スライドで締めて質疑へ。
-->

---

<!-- _class: title -->
<!-- _paginate: false -->

<p class="maintitle">ご清聴ありがとうございました</p>
<p class="subtitle">TAKTでAI駆動開発の品質を設計する</p>
<p class="event">かとじゅん（@j5ik2o） — github.com/j5ik2o/takt-sdd</p>

<!--
質疑応答へ。takt-sddのリリースは近日。興味があればリポジトリをwatchしてもらう。
-->
