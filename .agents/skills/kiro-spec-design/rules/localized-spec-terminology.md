# Localized Spec Terminology

Use this contract whenever a Kiro skill reads, writes, reviews, or validates spec artifacts.

- Newly generated Japanese specs use the Japanese terms from `.kiro/settings/templates/specs`.
- English specs remain valid and must be treated as alternate accepted terms, not deprecated terms.
- Keep diagnostics in the same language family as the artifact whenever possible.
- Do not translate machine-readable labels: `_Requirements:_`, `_Boundary:_`, and `_Depends:_`.

| Concept | Japanese spec term | English spec term |
|---------|--------------------|-------------------|
| Design boundary section | `境界コミットメント` | `Boundary Commitments` |
| Out-of-boundary subsection | `境界外` | `Out of Boundary` |
| Allowed dependencies subsection | `許可する依存` | `Allowed Dependencies` |
| Revalidation triggers subsection | `再検証トリガー` | `Revalidation Triggers` |
| File structure section | `ファイル構造計画` | `File Structure Plan` |
| Requirements traceability section | `要件トレーサビリティ` | `Requirements Traceability` |
| Requirement heading | `### 要件 N:` | `### Requirement N:` |
