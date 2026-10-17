# HTV Sewing

This repository contains a photo-first app and two earlier starting points for made-to-measure sewing patterns:

- [`pattern-studio/`](pattern-studio/) is the current photo-first interface. Gemini analyzes an uploaded reference, automatically matches a supported catalog design, collects its required measurements, and drafts SVG/PDF patterns. The Gemini API key stays on a local server. See its README for setup, JSON contracts, validation and design-testing limits.
- [`pattern-generator/`](pattern-generator/) is a runnable TypeScript MVP for a pull-on gathered skirt with an optional ruffle. It generates full-size SVG and tiled PDF patterns, including seam lines, grainlines, fold markers, labels, and a 50 mm calibration square. See its README for the measurement rules, drafting formulas, printing instructions, and sewing order.
- [`specs/`](specs/) is a versioned JSON input schema and an executable catalog of six FreeSewing designs. Its adapter maps validated inputs to design-specific settings, then drafts full-size SVG through pinned FreeSewing packages. Six synthetic examples and their rendered SVG files are included.

## Run the photo-first app locally

Use Node.js 22.18 or newer:

```bash
cd pattern-studio
npm ci
cp .env.example .env
# Add your own GEMINI_API_KEY to .env, then:
npm run dev
```

Open **http://127.0.0.1:4173**. Upload a photo, click **Analyze my photo**, enter the requested measurements, and click **Draft my pattern**. `.env` is excluded from Git. The tracked `.env.example` contains only an empty placeholder. Photos and garment notes are sent to Google Gemini when you analyze; body measurements are validated locally and are not sent to Gemini. All existing garment-fit and print-scale limitations still apply.

## Quick start

Use Node.js 22.18 or newer.

```bash
cd pattern-generator
npm install
npm test
npm run generate -- examples/skirt.json generated
```

The resulting `generated/pattern.pdf` must be printed at **actual size (100%)**. Measure its 50 × 50 mm calibration square before using the pattern.

To check the FreeSewing specification and adapter:

```bash
cd specs
npm ci
npm test
npm run render:examples
```

The two inputs currently use different schema versions and serve different purposes. Use the custom skirt generator for the included skirt example; use the FreeSewing schema as a contract for future design adapters.
