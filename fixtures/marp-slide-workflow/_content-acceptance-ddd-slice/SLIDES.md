---
marp: true
theme: default
paginate: true
size: 16:9
class: content-acceptance-ddd-slice
style: |
  :root {
    --accent: #b0241d;
    --bg-page: #faf7f1;
    --font-body: 'Noto Sans JP', sans-serif;
    --space-4: 16px;
    --radius-md: 6px;
    --ink: #2b2521;
    --muted: #6a5f57;
    --line: #d8cabd;
    --ok: #1f7a4d;
    --warn: #bd6b00;
    --info: #2364aa;
  }
  section {
    background: var(--bg-page);
    color: var(--ink);
    font-family: var(--font-body);
    padding: 44px 56px;
  }
  h1, h2 {
    color: var(--accent);
    letter-spacing: 0;
  }
  h1 { font-size: 42px; }
  h2 { font-size: 31px; margin-bottom: var(--space-4); }
  p, li { font-size: 24px; line-height: 1.42; }
  small { color: var(--muted); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  .triad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .panel {
    border: 2px solid var(--line);
    border-left: 8px solid var(--accent);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    background: #fffdf9;
  }
  .ok { border-left-color: var(--ok); }
  .warn { border-left-color: var(--warn); }
  .info { border-left-color: var(--info); }
  .label { color: var(--muted); font-size: 18px; font-weight: 700; text-transform: uppercase; }
  code { font-size: 16px; }
  pre {
    border-radius: var(--radius-md);
    padding: 16px;
    background: #1f2328;
    color: #f6f8fa;
    overflow: hidden;
  }
---

<!-- content-acceptance: ddd-slice -->
<!-- design-contract: ClaudeDesignSmoke token usage -->

# ドメイン駆動設計の実践 slice

備品購入申請・承認を題材に、業務の意味がモデルとコードへ移る瞬間を確認する。

<div class="panel info">
<div class="label">Acceptance scope</div>
9枚の代表slice。full 100〜140枚講義は生成しない。
</div>

<!-- _notes:
Speaker note intent: このPDFはDDD講義content acceptance用であり、workflow smokeではないと説明する。
-->

---

## 1. 変更に強い設計の焦点

<div class="grid">
<div class="panel">
<div class="label">Before</div>
<p>画面やDB都合が先にあり、承認ルールがServiceのif文へ散る。</p>
</div>
<div class="panel ok">
<div class="label">After</div>
<p>申請、承認、差戻し、上限金額などの業務語彙がモデル境界を作る。</p>
</div>
</div>

- Domain-Driven Design / ドメイン駆動設計の目的は、変更理由を業務概念の近くへ閉じ込めること。
- 共通題材は「備品購入申請・承認」に固定する。

<!-- _notes:
Speaker note intent: DDDを抽象論ではなく変更耐性の話として置く。
-->

---

## 2. 共通題材: 備品購入申請・承認

<div class="triad">
<div class="panel info">
<div class="label">申請</div>
購入目的、品目、金額、申請者をそろえる
</div>
<div class="panel warn">
<div class="label">審査</div>
上限金額、予算、証跡の不足を確認する
</div>
<div class="panel ok">
<div class="label">承認</div>
承認者、承認日時、Domain Eventを残す
</div>
</div>

```text
Draft -> Submitted -> Approved
                \-> Returned
```

固定アウトライン slice: 題材、状態、証跡、例外を同じ言葉で扱う。

<!-- _notes:
Speaker note intent: 同じ題材を使い続けることで、後続のValue ObjectやAggregateが唐突にならない。
-->

---

## 3. モデル要素の役割を分ける

| 要素 | この題材での例 | 変更時の守り方 |
|---|---|---|
| Value Object | Money, PurchasePurpose | 妥当性と単位を局所化する |
| Entity | PurchaseRequest | 識別子と状態遷移を持つ |
| Aggregate | PurchaseRequest aggregate | 不変条件を1つの入口で守る |
| Domain Event | PurchaseRequestApproved | 後続処理へ事実だけを渡す |

<div class="panel">
<div class="label">Design Contract token usage</div>
この表とcalloutは `var(--accent)`, `var(--space-4)`, `var(--radius-md)` を使う。
</div>

<!-- _notes:
Speaker note intent: 用語の丸暗記ではなく、変更が来たときにどこを直すかで役割を説明する。
-->

---

## 4. Java Before / After

<div class="grid">
<div>

```java
// Before
if (amount > 300000 && role.equals("manager")) {
  status = "APPROVED";
  mail.send(userId);
}
```

</div>
<div>

```java
// After
request.approveBy(approver, policy);
events.add(new PurchaseRequestApproved(
    request.id(), approver.id(), request.total()));
```

</div>
</div>

Afterでは、承認可否の判断を `ApprovalPolicy` と `PurchaseRequest` の言葉で読める。

<!-- _notes:
Speaker note intent: フレームワークAPIではなく、業務の意味がコード構造に出ていることを確認する。
-->

---

## 5. 演習: 境界を引き直す

<div class="panel warn">
<div class="label">Exercise</div>
「30万円以上は部長承認」「消耗品は月次予算を消費」「差戻し時は理由必須」を、どのモデル要素に置くか考える。
</div>

1. Value Objectに閉じるもの
2. Aggregateの不変条件にするもの
3. Domain Eventで外へ通知するもの

<div class="panel ok">
<div class="label">模範回答の方向</div>
金額単位はMoney、差戻し理由は状態遷移の事前条件、予算消費は承認Eventを起点に別境界へ渡す。
</div>

<!-- _notes:
Speaker note intent: 個人演習3分、隣席共有2分、模範回答2分の短い確認にする。
-->

---

## 6. 図解: 変更要求が来たときの置き場所

<svg viewBox="0 0 900 310" role="img" aria-label="DDD boundary placement diagram">
  <rect x="30" y="40" width="230" height="210" rx="6" fill="#fffdf9" stroke="#2364aa" stroke-width="4"/>
  <text x="55" y="88" font-size="28" fill="#2364aa">Application</text>
  <text x="55" y="130" font-size="22" fill="#2b2521">Command受付</text>
  <text x="55" y="164" font-size="22" fill="#2b2521">Transaction</text>
  <rect x="335" y="40" width="250" height="210" rx="6" fill="#fffdf9" stroke="#b0241d" stroke-width="4"/>
  <text x="360" y="88" font-size="28" fill="#b0241d">Domain</text>
  <text x="360" y="130" font-size="22" fill="#2b2521">PurchaseRequest</text>
  <text x="360" y="164" font-size="22" fill="#2b2521">ApprovalPolicy</text>
  <text x="360" y="198" font-size="22" fill="#2b2521">Money</text>
  <rect x="660" y="40" width="210" height="210" rx="6" fill="#fffdf9" stroke="#1f7a4d" stroke-width="4"/>
  <text x="685" y="88" font-size="28" fill="#1f7a4d">Integration</text>
  <text x="685" y="130" font-size="22" fill="#2b2521">通知</text>
  <text x="685" y="164" font-size="22" fill="#2b2521">会計連携</text>
  <path d="M260 145 H335" stroke="#6a5f57" stroke-width="4" marker-end="url(#arrow)"/>
  <path d="M585 145 H660" stroke="#6a5f57" stroke-width="4" marker-end="url(#arrow)"/>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#6a5f57"/>
    </marker>
  </defs>
</svg>

変更要求は、処理手順ではなく守るべき意味の近くへ置く。

<!-- _notes:
Speaker note intent: 図はinline SVG。軽量な境界図としてPDFで崩れないことを確認する。
-->

---

## 7. Appendix断片: 用語とチェックリスト

<div class="grid">
<div class="panel">
<div class="label">Glossary</div>
<ul>
<li>Value Object: 値の同一性と妥当性</li>
<li>Aggregate: 不変条件を守る境界</li>
<li>Domain Event: 起きた業務上の事実</li>
</ul>
</div>
<div class="panel ok">
<div class="label">Checklist</div>
<ul>
<li>状態遷移は業務語彙で読めるか</li>
<li>承認条件がUIやDB都合に漏れていないか</li>
<li>Eventが命令ではなく事実になっているか</li>
</ul>
</div>
</div>

<!-- _notes:
Speaker note intent: Appendixはfull deckの一部だけを代表させる。用語集と実践チェックリストの断片があればよい。
-->

---

## 8. Acceptance summary

このsliceで確認すること:

- DDD講義らしい内容密度がある
- 備品購入申請・承認の題材が一貫している
- Java Before / After、演習、模範回答、図解、Appendix断片が入っている
- Design Contract tokens が `SLIDES.md` CSS とvisualへ反映されている
- PDFは `slides/_content-acceptance-ddd-slice/SLIDES.md` から生成された artifact として追跡できる

<small>このPDFは `_workflow-smoke` の結果ではない。</small>

<!-- _notes:
Speaker note intent: smoke責務とcontent acceptance責務の分離を最後に再確認する。
-->
