import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createZipArchiveBuffer } from "./takt-marp-zip-archive.mjs";

export function buildClaudeDesignSmokeFixtureZipBuffer() {
  const manifest = {
    namespace: "ClaudeDesignSmoke",
    source: "smoke-fixture",
    globalCssPaths: ["tokens/fonts.css", "tokens/colors.css", "tokens/typography.css", "tokens/spacing.css", "styles.css"],
    components: [{ name: "Metric", sourcePath: "components/demo/Metric.jsx" }],
    startingPoints: [{ name: "Lecture kickoff", description: "Start with framing and expected outcomes." }],
    cards: [{ path: "guidelines/overview.card.html", group: "Guidelines", name: "Overview" }],
    templates: [{ name: "Generic deck", description: "Generic editable deck template", folder: "templates/generic-deck", entryPath: "templates/generic-deck/GenericDeck.dc.html" }],
    themes: [{ name: "High contrast light", description: "Light theme with strong accent contrast." }],
    fonts: [{ family: "Noto Sans JP", status: "available" }],
    brandFonts: ["Noto Sans JP", "JetBrains Mono"],
    tokens: [
      { name: "--accent", value: "#b0241d", kind: "color", definedIn: "tokens/colors.css" },
      { name: "--bg-page", value: "#faf7f1", kind: "color", definedIn: "tokens/colors.css" },
      { name: "--font-body", value: "'Noto Sans JP', sans-serif", kind: "font", definedIn: "tokens/typography.css" },
      { name: "--fs-md", value: "18px", kind: "font", definedIn: "tokens/typography.css" },
      { name: "--space-4", value: "16px", kind: "spacing", definedIn: "tokens/spacing.css" },
      { name: "--radius-md", value: "6px", kind: "spacing", definedIn: "tokens/spacing.css" },
    ],
  };
  return createZipArchiveBuffer({
    "_ds_manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "styles.css": [
      "@import url('./tokens/fonts.css');",
      "@import url('./tokens/colors.css');",
      "@import url('./tokens/typography.css');",
      "@import url('./tokens/spacing.css');",
      "",
    ].join("\n"),
    "tokens/fonts.css": "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP&family=JetBrains+Mono&display=swap');\n",
    "tokens/colors.css": ":root {\n  --accent: #b0241d;\n  --bg-page: #faf7f1;\n}\n",
    "tokens/typography.css": ":root {\n  --font-body: 'Noto Sans JP', sans-serif;\n  --fs-md: 18px;\n}\n",
    "tokens/spacing.css": ":root {\n  --space-4: 16px;\n  --radius-md: 6px;\n}\n",
    "SKILL.md": [
      "---",
      "name: generic-slide-design",
      "description: Generic slide design system fixture for validation.",
      "---",
      "",
      "Read `readme.md` and use the provided tokens, components, sample slides, and templates.",
      "",
    ].join("\n"),
    "readme.md": "# Generic Slide Design System\n\nUse the provided tokens and examples. This fixture is intentionally not tied to a domain.\n",
    "guidelines/overview.card.html": "<section>Generic guidance card</section>\n",
    "components/demo/Metric.jsx": "export function Metric() { return null; }\n",
    "components/demo/Metric.prompt.md": "Use Metric for compact numeric summaries when a deck needs a reusable data callout.\n",
    "slides/cover.html": "<section>Generic cover sample</section>\n",
    "templates/generic-deck/GenericDeck.dc.html": "<x-dc><!-- @template name=\"Generic deck\" --></x-dc>\n",
    "assets/mark.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"></svg>\n",
    "_adherence.oxlintrc.json": `${JSON.stringify({
      rules: {
        "no-restricted-syntax": [
          "warn",
          { selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]", message: "Raw hex color -- use a design-system color token via var()." },
          { selector: "Literal[value=/\\b\\d+px\\b/]", message: "Raw px value -- use a design-system spacing token via var()." },
        ],
      },
      "x-omelette": { tokens: manifest.tokens.map((token) => token.name), components: {} },
    }, null, 2)}\n`,
  });
}

export async function writeClaudeDesignSmokeFixture(targetInfo, options = {}) {
  const root = options.root ?? process.cwd();
  const designDir = path.join(root, "slides", targetInfo.deckName, "design");
  await mkdir(designDir, { recursive: true });
  if (options.writeDesignBrief !== false) {
    await writeFile(path.join(designDir, "design-brief.md"), [
      "# Design Brief",
      "",
      "Create a generic, high-contrast slide design system for a workflow validation deck.",
      "Use the normalized brief, audience constraints, brand constraints, and style constraints as the primary authoring input.",
      "",
    ].join("\n"), "utf8");
  }
  const filePath = path.join(designDir, "Claude Design Smoke.zip");
  await writeFile(filePath, buildClaudeDesignSmokeFixtureZipBuffer());
  return filePath;
}
