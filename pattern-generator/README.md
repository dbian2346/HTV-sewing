# Gathered skirt pattern MVP

This project turns body measurements and a garment specification into rectangular, full-size sewing pattern pieces. It makes a pull-on gathered skirt with an elastic casing, with an optional sewn-on ruffle. All input, drafting, and tiling dimensions are millimeters.

## Run it

Requires Node.js 22.18 or newer and `pdf-lib`.

```bash
npm install
npm test
npm run generate -- examples/skirt.json generated
```

The command writes `pattern.svg`, `pattern.pdf`, `normalized-spec.json`, and `dimensions.json` to the chosen output directory. The checked-in `sample-output/` is generated from `examples/skirt.json`. Print the PDF at **100% / actual size**, with printer scaling and “fit to page” off. Measure the 50 × 50 mm square on the cover page before cutting fabric. Pages after the cover are lettered by row and numbered by column: A1, A2, then B1, etc. The outlined tile areas overlap by the requested amount; align matching pattern lines in the overlap. Use the solid black cut lines. Gray dashed lines are stitching lines; red dashed lines are folds.

## Input contract

`spec.schema.json` is the versioned JSON Schema; `examples/skirt.json` is a complete valid input. The generator normalizes it to a TypeScript `PatternInput` and checks relationships the JSON Schema cannot easily express. The two measurements are the natural waist and the fullest hip circumference. `finishedLengthMm` measures from the top of the completed waistband to the bottom of the completed hem. The ruffle's `finishedHeightMm` is its visible height below its seam. All pieces use the same side seam allowance. `hemAllowanceMm` is a turn-up, not an added finished length.

The elastic cut length is `waistCircumferenceMm - elasticReductionMm + elasticOverlapMm`. Check elastic tension on the wearer before joining its ends. `ruffle.finishedHeightMm` and `ruffle.fullnessRatio` stay in the schema when `ruffle.enabled` is false, so switching the feature on does not require new fields.

## Drafting math

Let `C = max(waist × fullnessRatio, hip + hipEase)`. This ensures the shell and casing can pull over the hips. If hip clearance dominates, the effective fullness is `C / waist`, which may exceed the requested ratio.

| Piece | Cut count | Cut width on folded fabric | Cut height |
| --- | --- | ---: | ---: |
| Shell panel | 2 on fold | `C/4 + side seam` | `shell visible height + top seam + bottom seam or hem` |
| Waistband casing | 1 on fold | `C/2 + side seam` | `2 × (finished band height + join seam)` |
| Ruffle panel, if enabled | 2 on fold | `C × ruffle fullness / 4 + side seam` | `ruffle visible height + top seam + hem` |

The fold edge gets no allowance. The other short edge gets one seam allowance; after unfolding and sewing, the two shell panels make circumference `C`. The waistband is folded horizontally along its marked center line. Its two long raw edges join the shell waist. The ruffle is gathered along its top edge to match the shell bottom. The shell's visible height is `finished length - finished band height - visible ruffle height`. Without a ruffle, the shell ends in a hem. Straight grainlines run parallel to the fold edge.

## Sewing order

1. Cut two shell panels on the fold, one casing on the fold, and, if used, two ruffle panels on the fold. Keep the marked fold edges against fabric folds.
2. Sew the shell side seams. If using a ruffle, sew its side seams, gather its top to the shell bottom circumference, then sew and finish that seam.
3. Join the short ends of the casing to form a loop, leaving an opening on the inner half for elastic insertion. Fold the casing along its center line and attach both long raw edges to the shell top.
4. Insert elastic, overlap its ends by `elasticOverlapMm`, secure it, distribute gathers, and close the opening. Hem the skirt or ruffle using the marked hem turn-up.

## Architecture and stack choice

The flow is `JSON → normalize/validate → draft shared millimeter line model → SVG and PDF renderers`. `draft.ts` owns garment math and pattern marks; `svg.ts` and `pdf.ts` only render that geometry. `pdf.ts` converts millimeters to PDF points with `72/25.4`, clips every line to each tile, and repeats the 10 mm overlap at full scale. The cover is a separate calibration page. SVG declares physical `mm` dimensions plus a matching `viewBox`.

For this rectangular first garment, **custom TypeScript geometry + SVG + pdf-lib** is the smallest practical stack. It provides a clear, testable source of dimensions and direct control of page tiling. The [FreeSewing core and design documentation](https://freesewing.dev/reference/) describes a broader drafting ecosystem, including measurements, plugins, and designs. It is a stronger candidate when the roadmap adds shaped pieces, graded sizes, reusable drafting primitives, and more garment families. The [pdf-lib page API](https://pdf-lib.js.org/docs/api/classes/pdfpage) supports direct vector line drawing; this MVP uses it rather than attempting a full SVG-to-PDF conversion. SVG `viewBox` and physical sizing follow [MDN's SVG documentation](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox).

## Scope and next checks

The MVP produces straight rectangular pieces for woven fabric and an elastic waist. It does not model directional prints, shrinkage, cutting layouts, pockets, closures, shaped waistbands, or curved hems. A printer may still override scaling; the calibration square is the physical check. Before relying on a new size or fabric, print the square, measure seam lines and unfolded widths on assembled tiles, then sew a test garment and adjust elastic tension and fullness.
