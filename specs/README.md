# Garment specification v2 for FreeSewing adapters

This is a versioned application input contract and an executable catalog for six representative FreeSewing designs: Penelope (skirt), Titan (trouser block), Teagan (T-shirt), Simon (shirt), Sophie (dress), and Carlita (coat). It does **not** claim that every garment description or every FreeSewing design is supported. The six option lists are deliberately curated; other FreeSewing options retain their defaults until an adapter explicitly adds and tests them.

## Files

- `garment-spec.schema.json`: Draft 2020-12 JSON Schema with design-specific measurement requirements and option ranges.
- `measurement-catalog.json`: all direct measurement keys in the current [FreeSewing measurement reference](https://freesewing.dev/reference/measurements/), with units and descriptions.
- `design-catalog.json`: six design bindings, required and optional measurements, documented option keys, type, and range.
- `examples/penelope.json` and `examples/titan.json`: complete application requests.
- `map-to-freesewing.mjs`: a dependency-free adapter that validates the selected design's key measurements and options and emits FreeSewing settings.
- `design-registry.mjs`: explicit registry of the six installed design constructors.
- `render-design.mjs`: drafts one validated JSON input with the selected constructor and writes physical-size SVG plus a render report.
- `render-examples.mjs`: renders all six synthetic test specifications in `examples/`.
- `sample-renders/`: the six generated SVG examples and warning reports.
- `build-schema.mjs`: regenerates the JSON Schema after catalog edits.

Install Node.js 22.18 or newer, then run:

```bash
npm ci
npm test
npm run render:examples
node render-design.mjs examples/penelope.json rendered/my-penelope.svg
```

The design packages are pinned to FreeSewing 4.10.2. `npm run render:examples` writes into the ignored `rendered/` directory; `sample-renders/` is the checked-in output from the synthetic examples. Run `node build-schema.mjs` after changing the catalogs. Run `node map-to-freesewing.mjs examples/penelope.json examples/penelope.mapped.json` to inspect the translated settings.

The SVG files declare width and height in millimeters. They are full-size vector renders, not tiled PDFs. The `print` block is retained for a future PDF tiler and does not affect these SVG renders. Print from an SVG tool at actual size if you need a paper copy. The synthetic measurements demonstrate the integration; they are not fit-tested patterns. Each `.render.json` file records FreeSewing drafting warnings. Penelope currently reports repeated `sideSeamLength` store warnings, and Carlita reports one `sleevecapEase` warning under these test inputs; inspect and sew a test garment before using either as a final pattern.

`npm audit` currently reports advisories in FreeSewing 4.10.2's transitive `lodash.set` and `lodash.unset` packages. In particular, `lodash.set` has no patched release on npm. Keep this renderer as a local prototype and review upstream fixes before exposing it as a service that accepts untrusted input.

## Canonical request fields

| Path | Meaning | Passed to FreeSewing? |
| --- | --- | --- |
| `schemaVersion` | Contract version, currently `2` | No |
| `measurementSystem` | Must be `metric` | `units: "metric"` |
| `garment.designId` | Exact registered FreeSewing design | Chooses constructor |
| `garment.family` | UI category, checked against design | No |
| `garment.name` | User-facing name | No |
| `measurements` | Keys listed by selected design | Yes; millimeters except `shoulderSlope` in degrees |
| `options` | Supported design-specific options | Yes; see conversion below |
| `construction.seamAllowanceMm` | Seam allowance in millimeters | `sa` |
| `render.complete` | Include complete construction markings | `complete` |
| `render.paperless` | Dimensioned paperless view | `paperless` |
| `print` | A4/Letter, margin, overlap, 50 mm calibration square | Consumed by your PDF tiler, not FreeSewing |
| `fabric` | Fabric planning metadata | No; use it for review and future design-specific rules |

FreeSewing's [settings reference](https://freesewing.dev/reference/settings/) documents `measurements`, `options`, `sa`, `complete`, `paperless`, `scale`, and `units`. Its [options example](https://freesewing.dev/reference/settings/options/) passes percentages as fractions, for example `chestEase: 0.065`. Thus the input `"chestEasePct": 15` becomes `options.chestEase = 0.15`. Boolean, count, and degree values pass through unchanged. A design option name ending in `Pct` means percentage points in this contract; it does not imply a millimeter amount.

Each design's required measurements and option ranges were read from its design configuration in the [FreeSewing design reference](https://freesewing.dev/reference/designs/penelope/). The `npm test` command compares catalog requirements and mapped option names to the installed constructors, then drafts all six examples. The catalog's keys were checked against documentation on 2026-10-17. Fit and paper scaling still require physical checks before production.

For the earlier gathered-skirt MVP, keep its custom generator as a separate `designId` adapter. It is not a FreeSewing design and has a different measurement and option contract.
