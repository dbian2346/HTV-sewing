# HTV Sewing

This repository contains two related starting points for made-to-measure sewing patterns:

- [`pattern-generator/`](pattern-generator/) is a runnable TypeScript MVP for a pull-on gathered skirt with an optional ruffle. It generates full-size SVG and tiled PDF patterns, including seam lines, grainlines, fold markers, labels, and a 50 mm calibration square. See its README for the measurement rules, drafting formulas, printing instructions, and sewing order.
- [`specs/`](specs/) is a versioned JSON input schema and an executable catalog of six FreeSewing designs. Its adapter maps validated inputs to design-specific settings, then drafts full-size SVG through pinned FreeSewing packages. Six synthetic examples and their rendered SVG files are included.

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
