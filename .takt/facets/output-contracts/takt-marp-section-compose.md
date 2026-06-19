# Section Compose Artifact

この contract は `slides/<deck>/sections/manifest.md` と `slides/<deck>/sections/*.md` のsource artifactに適用します。

## manifest.md 必須内容

- `# Section Manifest` から始める
- Section order
  - section file名
  - slide ID range
  - slide count
  - source basis(`slide-blueprint.md` の範囲)
- Assembly checks
  - planned slide count
  - actual section slide count
  - missing slide IDs
  - duplicate slide IDs

## section file 必須内容

- YAML front matterを持たないMarp本文断片
- section fileの先頭slideは `---` delimiter で始めず、`<!-- slide_id: SNNN -->` から始める
- 2枚目以降のslideは `---` delimiter で区切る
- 各slideに `<!-- slide_id: SNNN -->` を含める
- 各slideにspeaker notesを含める
- `brief.normalized.md` の `Event Context` の `Name` が「未指定」以外の場合は、title slide相当のsection本文に含める
- `brief.normalized.md` の `Speaker Profile` 節の内容が「未指定」以外の場合は、自己紹介相当slideまたはtitle slideのspeaker contextに含める
- `html:` visual はHTML/CSS構造を本文に含める
- `svg:` / `inline-svg:` / `existing:` visual は `<!-- Visual: ... -->` placeholderを含める
- `none` visual はplaceholderを含めない

## 制約

- section fileはfront matter、theme、global styleを持たないでください。front matter とglobal styleはassemble stepが `SLIDES.md` にだけ書きます。
- `slide-blueprint.md` にないslide IDやcontent atomを勝手に追加しないでください。
- `sections/` はsource artifactです。`dist/`、`.takt/render/`、official delivery artifactを参照しないでください。
