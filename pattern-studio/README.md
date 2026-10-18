# Parametric sewing pattern engine

TypeScript engine with all 74 cataloged FreeSewing designs enabled alongside a custom gathered skirt with an elastic casing and optional ruffle, and a fitted Penelope pencil skirt drafted with FreeSewing. It validates JSON with Zod, drafts millimetre geometry, and exports SVG previews and vector PDFs using pdf-lib, with PDFKit for native SVG pieces. Use the browser test interface or the standalone CLI.

## Try the browser interface

```sh
npm ci
npm run dev
```

Add your Gemini API key to the project-root `.env` file (see `.env.example`):

```env
GEMINI_API_KEY=your_key_here
# Optional model override:
# GEMINI_MODEL=gemini-3.6-flash
```

Restart `npm run dev` after changing server files or `.env`. Open **http://127.0.0.1:4173**. Follow the welcome screen and choose **Explore as a guest**; registration controls are demo-only. Enter your measurements manually, or choose a full-body photo plus standing height for editable Gemini estimates. This separate body-photo flow is adapted from the supplied [SewBerry repository](https://github.com/shroomshroom900/SewBerry); see [the onboarding and measurement contract](docs/onboarding-and-photo-measurements.md). Then choose a garment reference photo and add garment notes, then click **Analyze my photo**. The local server sends the image and notes to Gemini, obtains neutral garment observations, and automatically matches a supported finished design. The user is not asked to select a catalog pattern. Unclear references prompt garment-detail questions; unsupported silhouettes do not produce a forced match.

Customize asks only for shoulder-to-shoulder, chest and waist on tops, or length and waist on bottoms, in centimeters. Essential values are filled from the guest profile where available. The drafting adapter converts to millimeters, uses saved/photo measurements for other required dimensions, and completes missing secondary dimensions using explicitly marked standard-proportion estimates. Continue to Fabric, choose fabric width and length, then Generate Pattern. Estimated fit is not a fully measured custom fit. Garment-reference analysis does not estimate body dimensions; body-photo estimation is an explicit separate request with height calibration. Numeric design options retain the matched design's defaults. The JSON tab shows garment intent and the resolved engine specification separately. The original sample analyzer remains only as a test fixture.

The key is read only by the local Node server. Static routes serve a fixed list of build assets and cannot serve `.env`; the key is sent to Google in the request header, never bundled into browser JavaScript. The server binds to `127.0.0.1`, checks API request origins, bounds image uploads to 8 MB, and retains analysis metadata in memory for 30 minutes. It does not save images to disk or persist measurements. Restarting the server expires pending analyses. A model response is schema-validated and selected IDs/options are checked against installed adapters before drafting.

See [docs/photo-to-pattern.md](docs/photo-to-pattern.md) for the architecture. Generated patterns include piece previews, zoom, sewing notes and A4/Letter PDF or SVG downloads. Changed or invalid inputs disable stale downloads. Print at Actual Size and verify the calibration square. The Gemini integration does not establish garment fit or validate the previously untested design engines.

`npm run build:ui` creates the static interface in `out/`. `web/` imports the original engine directly, and `scripts/build-ui.mjs` bundles it for the browser using esbuild. The engine's `npm run build` output remains in `dist/`. The preview's zoom changes only the screen display; printed PDFs stay at 1:1 scale. Print at Actual Size and verify the calibration square.

The existing FreeSewing v2 contract, catalogs, examples and adapter are preserved. Their documentation is in [docs/freesewing-adapter.md](docs/freesewing-adapter.md). That contract is separate from the gathered-skirt input: `garment-spec.schema.json` still describes the FreeSewing adapter, while **`gathered-skirt.schema.json` describes this engine**. The custom draft does not execute FreeSewing packages.

## Design database

`design-catalog.json` contains **74 entries** from the [FreeSewing collection](https://www.npmjs.com/package/@freesewing/collection/v/4.10.2), including the reusable part library. The original six curated entries are preserved. The other 68 entries were imported from static package metadata, with names, categories, descriptions, tags, required/optional measurements, and 1,660 option bindings covering booleans, percentages, degrees, counts and enumerated choices. Numeric defaults/ranges and conditional-menu indicators are retained when declared by the package.

All catalog entries remain registered in the drafting engine; the photo-first interface chooses the design through its matching stage. Penelope retains its previously tested, pinned 3.1.0 adapter. The other 73 entries use the FreeSewing 4.10.2 catalog engine; the pinned 3.1.0 Penelope engine is isolated in its own workspace and the generic entries remain `runtimeStatus: "enabled-unverified"` with `fitValidated: false`. Waralee now has automated drafting and export regression checks (`testStatus: "automated-checks"`); the remaining generic catalog entries retain their existing test labels. Programmatic callers can supply the selected design’s measurements and options; blank options retain native defaults. Native SVG preserves curved paths, transformations, snippets, text and material-specific markings. PDFKit converts those pieces into vectors, then pdf-lib tiles them for A4/Letter printing with overlap and calibration. Native labels and the original design instructions govern cutting and construction.

No new design drafting, seam, export or garment-fit tests were run when enabling these entries. Compile and bundle checks cover the application code only. Some sample measurements or option combinations may need adjustment; draft errors are displayed and downloads are disabled until drafting succeeds. The reusable part-library entry is available for exploration rather than a complete garment.

The version-2 reference schema includes all catalog entries, and the reference mapper supports their enum choices. To reproduce the metadata import without installing the full collection into the application:

```sh
npm install --prefix tmp/catalog-import --ignore-scripts @freesewing/collection@4.10.2 @freesewing/config@4.10.2 @freesewing/plugin-transform@4.10.2 @freesewing/i18n@4.10.2
node scripts/import-design-catalog.mjs tmp/catalog-import/node_modules/@freesewing/collection
node build-schema.mjs
```

The importer reads static design configurations, including inherited measurement/option requirements, and skips existing entries. It never calls drafting or rendering methods. `measurement-catalog.json` already covers every imported measurement key.

## Photo-to-design matching catalog

[`supported-designs.json`](supported-designs.json) contains all **75 supported entries**: 74 FreeSewing entries plus the custom gathered skirt. Download it from the browser’s **JSON specification → Design catalog JSON** link and attach it alongside a reference photo in a vision-capable LLM. Ask the LLM to follow the file’s instructions and return the included `responseFormat`.

Each entry includes a design description, observable visual features, similar designs to compare, supported visual option keys and enum choices, measurement keys, runtime status and input format. `design-catalog.json` also stores the enriched descriptions and `visualMatching` metadata for each FreeSewing entry, preserving previous upstream descriptions as `packageDescription`. The compact photo catalog reads current runtime measurement/option definitions, including the curated Penelope adapter, so its option keys match the interface.

The matching instructions request up to three ranked candidates with visible evidence, differences, uncertainty and questions. They allow ambiguous, unsupported and unclear-image results. The reusable part library is excluded from photo candidates, and foundation blocks are identified as development starting points. Descriptions are editorial cues derived from installed package metadata and source, not a photo-validated recognition dataset. Measurements are collected separately from image matching.

Regenerate the JSON after changing catalog descriptions or runtime definitions:

```sh
npm run catalog:matching
```

UI builds also regenerate and copy the file into `out/`. The photo-first interface uses this catalog for server-side Gemini matching. Static builds alone cannot analyze photos; use the local server to keep the API key private.

## Run

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run check
npm test
npm run build
npm run generate -- examples/gathered-skirt.json output/ruffled A4
npm run generate -- examples/plain-skirt.json output/plain Letter
```

Each CLI run writes `pattern.json` (geometry, seams, dimensions and construction steps), `pattern.svg`, `pattern.pdf`, and `layout.json` (exact cutting paths and optimizer metadata). Validation failures exit with status 1 and report field paths. PDF options are exposed through the library; CLI arguments select input, output directory and paper size.

`generateStudioPattern(spec).layout` contains JSON-safe per-piece geometry, dimensions, material-specific cutting quantities, grainlines, cutting-fold edges and conservative rotation constraints. `exportStudioArtifacts(pattern)` returns `{ svg, layout }` together. Curves remain native cubic Bézier operations and SVG path data, rather than bounding rectangles. Fabric width/length are separate optimizer inputs. See [the layout export contract](docs/layout-export.md), including handling of mirrored cuts, folded templates and pieces marked for review.

```ts
import { generatePattern, exportSVG, exportPDF } from './dist/index.js';
import { writeFile } from 'node:fs/promises';

const pattern = generatePattern({
  measurements: { waist: 720, hip: 980 },
  garment: {
    type: 'gathered_skirt', length: 600, fullnessRatio: 2,
    ruffle: { enabled: true, height: 120, fullnessRatio: 1.5 },
  },
});
const svg = exportSVG(pattern);
const pdf = await exportPDF(pattern, {
  paperSize: 'A4', tiled: true, calibrationSquare: true,
  margin: 12, overlap: 10,
});
await writeFile('skirt.svg', svg);
await writeFile('skirt.pdf', pdf);
```

## Input contract

All lengths, measurements, seam allowances, and coordinates are **millimetres**. Ratios are dimensionless. `length` means the **finished vertical distance from the top of the waistband to the final hem**, including the waistband and ruffle. Fullness is relative to the body waist measurement, before elastic contraction.

| Field | Default | Meaning |
| --- | --- | --- |
| `measurements.waist`, `measurements.hip` | Required | Body circumferences, 200–5000 mm |
| `garment.type` | Required | Must be `gathered_skirt` |
| `garment.length` | Required | Finished waist-to-hem length, maximum 2000 mm |
| `garment.fullnessRatio` | 2 | Body circumference / waist, 1–5 |
| `garment.waistband.finishedHeight` | 30 | Casing height above waist seam, 20–150 mm |
| `garment.waistband.elasticWidth` | 25 | Elastic width; casing must be at least 3 mm wider |
| `garment.waistband.hipEase` | 40 | Added to max(hip, waist) for the open casing circumference |
| `garment.waistband.elasticLengthRatio` | 0.9 | Joined elastic length / waist, 0.5–1 |
| `garment.waistband.elasticOverlap` | 20 | Added to joined elastic length for the overlapped joint |
| `garment.waistband.elasticStretchRatio` | 2 | Usable stretched length / joined relaxed length, 1–4 |
| `garment.ruffle.enabled` | false | Add front/back ruffle pieces |
| `garment.ruffle.height` | 120 | Finished vertical ruffle height, 40–1000 mm |
| `garment.ruffle.fullnessRatio` | 1.5 | Ruffle circumference / skirt body circumference, 1–4 |
| `construction.seamAllowance` | 10 | Side, waistband and joining edges, 0–100 mm |
| `construction.hemAllowance` | 25 | Total turn-up at the final hem, 0–100 mm |

Unknown properties, stringified numbers, nonfinite values, out-of-range values, insufficient hip clearance, insufficient elastic stretch, a too-narrow casing, and body heights under 40 mm are rejected. Omitted nested objects receive defaults; disabled ruffle values are still structurally validated. Zero seam/hem allowance is supported for alternative construction methods; in that case the corresponding notch or hem fold is omitted and the maker must choose an appropriate edge finish.

`src/schema.ts` is the source of truth. Run `npm run schema` to regenerate `gathered-skirt.schema.json`. The JSON Schema covers structure and field ranges; **cross-field sewability checks require `specSchema.parse(input)` or `generatePattern(input)`**. Schema generation uses [Zod's JSON Schema conversion](https://zod.dev/json-schema).

## Gathered-skirt drafting and construction assumptions

This MVP models straight rectangular panels and a single folded elastic casing for woven fabric. It has two full-width body panels, one full-circumference waistband strip with a short-end join at a side seam, and optionally two full-width ruffle panels. Cut each labeled piece once on a single layer. There are no cut-on-fold edges; the waistband has a lengthwise construction fold. Grain runs vertically on every printed rectangle, including across the short width of the long waistband strip.

Let `W` be waist, `H` hip, `F` skirt fullness, `B` finished casing height, `L` total length, `R` finished ruffle height, and `G` ruffle fullness:

- Body circumference `C = W × F`. Each front/back stitching rectangle is `C/2 × (L − B − R)` with a ruffle, or `C/2 × (L − B)` without one.
- Open waistband circumference `O = max(W, H) + hipEase`. Its stitching rectangle is `O × 2B`. Folding lengthwise makes a casing of finished height `B`; both raw long edges enter the waist seam.
- Each ruffle stitching rectangle is `(C × G)/2 × R`. The ruffle gathers to its corresponding body panel, with center and side-seam marks aligned.
- Joined elastic length is `W × elasticLengthRatio`; cut elastic length adds `elasticOverlap`. Its declared usable stretch must reach `O`.
- `C ≥ O` is required. Body tops gather to `O`, then the elastic contracts the casing toward the wearer’s waist.
- Cutting rectangles add the four independent edge allowances. Body bottoms receive seam allowance when a ruffle attaches, otherwise hem allowance. Ruffle bottoms receive hem allowance. Side-seam lengths are equal before sewing; gathered seams explicitly record source length, target length and ratio.
- A hem allowance of 25 mm means **two 12.5 mm turns**, leaving the finished hem on the bottom dashed line. The extra dotted fold line marks the first turn. A fold line inside the waistband marks the top of the casing. No turn-of-cloth or fabric-thickness correction is applied.

For the supplied ruffled example: body pieces have 720 × 450 mm seam rectangles (740 × 470 mm cut); waistband 1020 × 60 mm (1040 × 80 mm cut); ruffles 1080 × 120 mm (1100 × 155 mm cut). Finished length is `30 + 450 + 120 = 600 mm`. Elastic cuts at 668 mm with a 20 mm overlap.

Assembly steps are included in `pattern.instructions`. Make shallow notches only in seam allowances. Join body sides; optionally join, hem, gather and attach ruffles; join and fold the waistband; gather the body to the casing and attach both raw casing edges, leaving a gap for inserting elastic; insert and overlap elastic, then close the gap. Try the elastic on the wearer and check its actual stretch before cutting it. This is a mathematical rectangular draft, not a fitted block or a sewn fit validation. Fabric width is not considered: split unusually wide strips into additional panels using added seam allowances if your fabric requires it.

## Geometry and extension points

```text
JSON -> Zod structure + cross-field validation -> template draft -> Pattern geometry
                                                               |-> SVG exporter
                                                               |-> PDF exporter
```

- `src/schema.ts`: input types, defaults and relational validation.
- `src/draft.ts`: template dispatch, calculations, pieces, seam relationships and instructions.
- `src/geometry.ts`: points, rectangles, per-edge offsets, grainlines, folds, notches, and shared vector/text primitives. Local coordinates start at each cutting rectangle's top-left; y increases downwards. Geometry retains floating-point precision; displayed dimension labels round to 0.01 mm.
- `src/svg.ts`: deterministic vertical layout with explicit `mm` dimensions and a matching viewBox. Solid cutting lines, dashed sewing/finished-hem lines, dot-dash folds and text remain editable vectors.
- `src/pdf.ts`: exact `72 / 25.4` points per mm, y-axis conversion, per-piece tiling and clipping using [pdf-lib's vector page API](https://pdf-lib.js.org/docs/api/classes/pdfpage).

The drafting modules have no rendering dependencies. The gathered-skirt rectangle helper stays restricted to rectangles. Penelope uses FreeSewing's curved offsets and structured cubic operations. The shared `src/vector.ts` document and primitive model supports both; `src/studio.ts` dispatches the interface and CLI to the explicitly registered templates.

## Printing and tile assembly

PDFs use A4 (210 × 297 mm) or US Letter (215.9 × 279.4 mm), default 12 mm margins and 10 mm overlap. Each piece has its own row/column grid and a 6 mm protective inset. Tile viewport dimensions equal paper dimensions minus two margins; strides equal viewport dimensions minus overlap. Neighboring tiles repeat identical pattern-space geometry and registration crosses inside the overlap. Trim the outside white margins, then overlay the repeated pattern lines and crosses. Assemble each piece separately, following its row/column labels. With zero overlap, butt trimmed page frames together.

The first page contains an isolated **50 × 50 mm calibration square**, a legend and grid summary. Measure between the stroke centers. Print at **100% / Actual Size**, disable Fit/Shrink, and verify the square before assembling. The PDF sets `PrintScaling=None` as a viewer preference, but printer dialogs can override it; software cannot force a printer to preserve scale.

`tiled: false` creates one custom full-size sheet per piece (and a calibration page on the selected paper). This is suitable for a compatible plotter, not automatic fitting to office paper. `calibrationSquare: false` omits the guide page. `maxPages` defaults to 500; exports exceeding it fail before PDF rendering. Untiled sheets exceeding the standard 14400-point page limit are rejected.

PDF and SVG generation are reproducible for identical geometry, options and installed dependency versions. PDFs use fixed metadata dates and no raster pattern images.

## Verification

`npm test` verifies known numerical drafts, matching seams, gathering ratios, allowance offsets, notch positions, fold positions, validation failures, noninteger inputs, tile boundaries and coverage, PDF MediaBoxes, vector calibration-square dimensions, 1:1 coordinates, clipping, print preferences and deterministic bytes. `npm run check` and `npm run build` check the public TypeScript modules. `npm run test:legacy` checks the retained FreeSewing adapter.

The generated examples should also be inspected visually and the printed calibration square measured. Automated dimensions establish the mathematical model; they do not replace a physical print check or a sewn sample.

## FreeSewing fitted-skirt integration

```sh
npm run generate -- examples/penelope.json output/penelope A4
```

The CLI accepts gathered-skirt JSON and version-2 Penelope JSON. Without a paper argument, Penelope uses its JSON print setting; gathered skirts default to A4. The JSON output retains the complete template draft: original seam relationships for gathered skirts, and vector pieces, dimensions and measured seam checks for Penelope.

```ts
import { generatePenelope, exportVectorSVG, exportVectorPDF } from './dist/index.js';

const fitted = generatePenelope({
  schemaVersion: 2, measurementSystem: 'metric',
  garment: { designId: 'penelope', family: 'skirt' },
  measurements: {
    waist: 760, seat: 1020,
    waistToHips: 190, waistToSeat: 230, waistToKnee: 590,
  },
  options: { curvedDarts: true, nrOfDarts: 2, backVent: true, waistband: true },
});
const svg = exportVectorSVG(fitted.vector);
const pdf = await exportVectorPDF(fitted.vector, { paperSize: 'A4' });
```

`generateStudioPattern`, `exportStudioSVG` and `exportStudioPDF` dispatch either input contract. `penelope-runtime.schema.json` is the registered adapter's structural schema; `npm run schema` regenerates it and the gathered-skirt schema. Relational dimensions and seam tolerances are checked at runtime. The broader `garment-spec.schema.json` describes all 74 catalog entries; Penelope has a curated adapter and all other entries use the generic FreeSewing 4.10.2 adapter, with Waralee covered by drafting/export regression tests. Arbitrary clothing descriptions are not a drafting input.

Penelope requires **waist, seat, waist-to-hips, waist-to-seat and waist-to-knee**. Seat is the fullest seat/buttock circumference, not the high hip. Optional back arcs must be supplied together. This adapter supports seat ≥ waist and waist-to-hips < waist-to-seat < waist-to-knee, with the adjusted body extending at least 60 mm below the seat. Proportions failing the engine's numerical checks are rejected.

Supported options are curved/straight darts, one/two darts per half panel, a back vent, an optional waistband, body-length adjustment (−50% to +50%), hem taper (−35% to 0), and waist/seat ease (0% to 8%). Percentage points map to FreeSewing fractions. This variation uses woven fabric, a **back zipper** and **no waistband overlap**. It has no elastic. Without a band, prepare separate bias binding or a facing; a facing template is not included.

Body length is `waistToKnee × (1 + lengthBonusPct / 100)`. A band adds half its drafted strip width above the body: a default 590 mm body plus 29.5 mm band gives 619.5 mm total length. FreeSewing drafts its own hem turn-up, including seam allowance; the gathered-skirt `hemAllowance` does not apply. Cut front once on fold, back twice mirrored, and the optional band once on its short-edge fold, then unfold and fold lengthwise during construction.

The implementation pins **`@freesewing/penelope` and `@freesewing/core` to 3.1.0** and tests the installed configuration against the curated catalog. It uses the [Penelope constructor and exported parts](https://freesewing.dev/reference/designs/penelope/) with explicit front-before-back registration because the back's seam calculation reads a value stored by the front. No `node_modules` files are patched. Overlap is explicitly zero, so zipper edges meet without relying on the upstream band-overlap calculation.

The adapter reads [structured render properties](https://freesewing.dev/reference/api/pattern/getrenderprops/), converting move/line/cubic/close operations to shared vector primitives. This avoids malformed definitions observed in the packaged string renderer. It preserves unrounded cubic coordinates, curved dart lines and design seam allowances, recreates grain/fold arrows and cutting labels, adds seat-level side notches and a lengthwise band fold, and replaces decorative logos/date labels and the native scale box with the exporter's standalone 50 mm square. Self-crossing **straight** offset joins at the vent are trimmed at their segment intersection; cubic geometry is not flattened or changed. Unsupported path transforms fail explicitly.

SVG and PDF use the same primitives. PDF cubics remain vectors at `72 / 25.4` points per mm, with tiling, overlap, alignment marks and calibration. Piece width/height are **sheet bounds**, not rectangular cutting dimensions for shaped pieces. Downloads include all templates and marks regardless of preview selection.

Drafts must pass side-seam matching within **1 mm** and closed-dart waist vs. eased waist (and optional band) within **4 mm** around the full circumference. The latter reflects FreeSewing's per-quarter tolerance: ease the documented small difference into the band. Dart legs are excluded from the closed-waist calculation; hem extensions are excluded from side-seam matching. At zero seam allowance, cutting paths bridge dart tops, keeping dart legs as stitching marks. Tests cover 48 combinations of size, dart type/count, vent and band, plus curves, allowances, input validation, catalog consistency, reproducibility and A4/Letter PDF vectors.

These checks establish numerical assembly relationships, **not wearer fit**. Physical print scale and sewn samples remain unverified. Sew a toile and check sitting/walking ease, dart placement, fabric behavior, zipper length and vent construction before using final fabric.

### Waralee wrap pants

Waralee is included once in the design and photo-matching catalogs. Its simplified Customize form asks for finished front length and waist in centimeters. The adapter converts to millimeters and derives the native inseam/leg-size settings without using garment length as waist-to-hip depth. Saved inseam measurements are preserved; unsupported lengths receive a concise range error. See [Waralee integration notes](docs/waralee.md) and `examples/waralee.json` for the full native input contract. Automated checks cover several sizes, pocket/waistband variants, native curves and cutting quantities, facing outlines, SVG and tiled PDF export. This does not establish sewn fit.
