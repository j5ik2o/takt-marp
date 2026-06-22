render evidence と compose source artifacts を照合し、visual/layout/render finding を記録してください。

**やること:**
1. `.takt/render/<deck>/cycle-1/metadata.json`、`.takt/workflow-current-target.json`、`sections/*`、`SLIDES.md`、HTML visual、`images/*` を読んでください。marker に `design_contract.path` がある場合は、その Resolved Design Contract も読んでください。
2. marker に `design_contract.path` がある場合は、marker の `design_contract.fingerprint.contract_sha256` と Resolved Design Contract の `fingerprint.contract_sha256` を照合してください。Design Brief fingerprint が記録されている場合は current Resolved Design Contract と一致することも確認してください。`SLIDES.md` front matter CSS、各 `_class`、`sections/*` の HTML/CSS、HTML visual、`images/*` が Resolved Design Contract の token constraints、brand fonts、adherence metadata、guidance、source_catalog と矛盾していないか確認してください。contract fingerprint 不一致、Design Brief fingerprint 不一致、token drift、token 定義外の raw color / raw px / 未提供 font-family、token constraints と無関係な class/style、guidance / source_catalog との明確な不一致は finding としてください。
3. HTML/PDF/PDF raster の status と degraded reason を確認してください。
4. visual、layout、render、design-token 関連の問題だけを finding として記録してください。
5. `design_contract` がない既存 deck では legacy path として扱い、Design Contract fingerprint や token drift の判定は行わず、既存の render evidence と source artifact で検査できる finding だけを記録してください。Design Contract 不在そのものを blocked finding にしないでください。
6. plan-level content、中心メッセージ、delivery artifact の要否は scope 外として扱ってください。
7. `review/polish-inspect.md` に stable `finding_id` 付きで finding を書いてください。

**判定基準:**
- 修正不要なら `approved` としてください。
- visual/layout/render/design-token source correction で解消できる問題がある場合は `needs_fix` としてください。
- render evidence metadata が読めない場合は `blocked` としてください。

**report file format:**
- `review/polish-inspect.md` は YAML front matter で開始し、`command: polish`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: inspect`、`cycle`、`state: inspected`、`result`、`finding_count`、`blocking_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Polish Inspect
- Result: approved / needs_fix / blocked
- Findings:
- Degraded render notes:
- Out-of-scope notes:
- Blocking issues:
