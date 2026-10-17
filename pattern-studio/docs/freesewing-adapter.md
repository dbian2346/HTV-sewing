# Garment specification v2 for FreeSewing adapters

> The catalog now contains 74 collection entries. This document describes the original six curated bindings; the other 68 were imported from static 4.10.2 metadata and are untested, reference-only entries. See the root README's Design database section. Enum option values pass through unchanged. Penelope's separate runtime adapter is described in the root README.

This is a versioned application input contract and a verified reference catalog for six representative FreeSewing designs: Penelope (skirt), Titan (trouser block), Teagan (T-shirt), Simon (shirt), Sophie (dress), and Carlita (coat). It does **not** claim that every garment description or every FreeSewing design is supported. The six option lists are deliberately curated; other FreeSewing options retain their defaults until an adapter explicitly adds and tests them.

## Files

- `garment-spec.schema.json`: Draft 2020-12 JSON Schema with design-specific measurement requirements and option ranges.
- `measurement-catalog.json`: all direct measurement keys in the current [FreeSewing measurement reference](https://freesewing.dev/reference/measurements/), with units and descriptions.
- `design-catalog.json`: 74 design/part-library entries with required and optional measurements, option metadata and explicit runtime status; six entries retain their original curated bindings.
- `examples/penelope.json` and `examples/titan.json`: complete application requests.
- `map-to-freesewing.mjs`: a dependency-free adapter that validates the selected design's key measurements and options and emits FreeSewing settings.
- `build-schema.mjs`: regenerates the JSON Schema after catalog edits.

Run `node build-schema.mjs` after changing the catalogs. Run `node map-to-freesewing.mjs examples/penelope.json examples/penelope.mapped.json` to see the translated settings. Install the selected FreeSewing design package separately and construct it with `new Design(mapped.freesewingSettings).draft()`; this bundle does not install or execute design packages.

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

Each design's required measurements and option ranges were read from its design configuration in the [FreeSewing design reference](https://freesewing.dev/reference/designs/penelope/). The reference can change when a package changes. Before production, pin FreeSewing package versions, compare their `Design.designConfig` to this catalog, instantiate all six designs with representative measurements, and sew fit samples. The catalog's keys were checked against documentation on 2026-10-17; package execution has not been verified here.

For the earlier gathered-skirt MVP, keep its custom generator as a separate `designId` adapter. It is not a FreeSewing design and has a different measurement and option contract.
