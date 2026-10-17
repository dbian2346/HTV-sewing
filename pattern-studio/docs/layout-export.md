# SVG and optimizer geometry export

```ts
import { generateStudioPattern, exportStudioArtifacts } from './src/index.js';

const pattern = generateStudioPattern(spec);
const { svg, layout } = exportStudioArtifacts(pattern);
// layout.pieces is JSON-safe; no FreeSewing instances or circular references.
```

`generateStudioPattern(spec)` now includes `pattern.layout`. `exportStudioSVG()` still returns the same full-scale SVG string. `exportStudioArtifacts()` returns `{ svg, layout }` together, filtering metadata to the SVG groups being exported.

The CLI writes `layout.json` beside `pattern.svg`, `pattern.pdf`, and `pattern.json`:

```sh
npm run generate -- examples/penelope.json output/penelope
```

The phone UI offers **Download layout JSON** after generating a pattern, beside the existing SVG/PDF export workflow.

## Payload

```json
{
  "schema_version": 1,
  "units": "mm",
  "coordinate_system": "x_right_y_down",
  "pieces": [
    {
      "id": "part:fabric:0",
      "name": "Part",
      "material": "fabric",
      "cut_quantity": 2,
      "cut_type": "mirrored",
      "mirrored_pairs": 1,
      "unpaired_quantity": 0,
      "width_mm": 100,
      "height_mm": 75,
      "origin_mm": [10, 20],
      "outline": {
        "format": "svg_path",
        "d": "M 0 0 C 0 100 100 100 100 0 Z",
        "commands": [
          { "type": "move", "to": { "x": 0, "y": 0 } },
          { "type": "curve", "cp1": { "x": 0, "y": 100 }, "cp2": { "x": 100, "y": 100 }, "to": { "x": 100, "y": 0 } },
          { "type": "close" }
        ],
        "closed": true
      },
      "grainline": { "from": [40, 20], "to": [40, 60], "angle_deg": 90 },
      "on_fold": false,
      "fold_line": null,
      "on_bias": false,
      "can_rotate": false,
      "allowed_rotations_deg": [0],
      "optimizer_ready": true,
      "issues": [],
      "source": { "svg_group_id": "stack", "part_id": "part", "path_id": "sa" }
    }
  ]
}
```

The curved example above illustrates the schema. Actual exported values come from the draft.

## Geometry contract

- `outline` contains the **actual cutting boundary**, including seam/hem allowances already drafted by the engine. Do not add the allowance again. It excludes grain marks, labels, print margins and sewing/dart marks.
- FreeSewing's native `move`, `line`, `curve` (cubic Bézier) and `close` operations are copied at full precision. `d` is the corresponding exact SVG path string. No polygon sampling or bounding-box replacement occurs. The gathered-skirt engine really does draft rectangular pieces, so its outlines are rectangles.
- Each outline is translated to its own cutting-boundary origin. Add `origin_mm` to recover the intrinsic drafting coordinates. Grain/fold endpoints share the normalized outline coordinate system. `source` links to the displayed SVG's outer group and native part/path; display packing transforms are not nesting constraints.
- `width_mm` and `height_mm` are analytical bounds of the cutting contour, including Bézier extrema, **not** control-point bounds or the annotated SVG sheet dimensions. These dimensions describe the native template orientation before applying an allowed rotation.
- Some native allowance paths deliberately omit a straight cutting-fold edge. That edge is closed only when both contour endpoints lie on the native fold line. Other open/ambiguous paths are flagged for review.
- For the Penelope adapter, the exported contour includes the same offset-loop correction as the SVG. Its zero-allowance cutting outline excludes the sewing darts.

A Python optimizer can parse `outline.d` with an SVG path library, or consume `outline.commands` directly. If its collision engine only accepts polygons, flatten Bézier curves **there**, using an explicit error tolerance in millimeters; retain the vector path for the final output. Validate topology and collision clearances as part of nesting.

## Quantities, materials and constraints

Each native part/material/cut-instruction combination is a separate entry. A stack containing multiple parts is not collapsed to one rectangle. Fabric, lining, and interfacing quantities are not summed together. Select the desired material for a fabric run.

`cut_quantity` is the **total required number of finished cut pieces** for that entry. `mirrored_pairs` and `unpaired_quantity` partition that total; do not multiply the total by two again. Mirroring a placement must also transform its contour and constraint endpoints.

For `on_fold: true`, the outline is the native **folded template**, with the actual cutting fold specified by `fold_line`. Construction folds (such as the gathered skirt waistband's lengthwise sewing fold) are not cutting-fold constraints. The optimizer must either place the template against the fabric fold with the correct folded usable width, or explicitly unfold the contour by reflecting it across `fold_line` before single-layer nesting. Do not nest a folded half-template as a complete single-layer piece.

Angles use SVG coordinates: 0° points right, 90° points down. `grainline.angle_deg` is the native grain direction, not always vertical. `on_bias` preserves the native material instruction. Rotation values are clockwise angles **relative to the exported outline**.

`allowed_rotations_deg` gives one conservative alignment: lengthwise grain parallel to the fabric's y axis, or 45° for a bias cut; a cutting fold is aligned to a lengthwise fabric fold. For example, a horizontal-grain waistband may require `[90]`. `can_rotate: false` prohibits arbitrary extra rotation. A 180° alternative is deliberately not authorized without knowing the user's nap/directional-print requirements. The Python optimizer may expose explicit fabric policies to relax this later.

Missing cut quantities, ambiguous/missing cutting outlines, missing grain/fold metadata, conflicting grain/fold requirements, and unhandled native geometry transforms produce `optimizer_ready: false` and `issues`. Missing quantities/dimensions/geometry are `null`, never guessed. Unresolved paths are included as `native_paths` with their original commands and path transforms for inspection. Native part transforms are retained in `source.part_transforms` when present. Such entries must be resolved before treating the export as a complete cutting layout. `optimizer_ready` means these metadata checks passed; it is not a guarantee of valid topology, collision-free placement, fit or fabric suitability.

## Separate fabric inputs in Python

Fabric size is deliberately absent from pattern generation. Submit it when calling the optimizer:

```python
import json

with open("layout.json") as f:
    layout = json.load(f)

fabric_width_mm = 1400   # supplied by the user
fabric_length_mm = 3000  # supplied by the user
pieces = [p for p in layout["pieces"] if p["material"] == "fabric"]
if any(not p["optimizer_ready"] for p in layout["pieces"]
       if p["material"] in ("fabric", None)):
    raise ValueError("Resolve the exported piece issues before nesting")
# Send pieces, fabric_width_mm and fabric_length_mm to your optimizer.
# It must handle quantities, mirrors, curves, folds, grain and clearances.
```

The exporter does not implement the Python optimizer, fabric UI, shrinkage compensation, or a packing algorithm.

## Fabric settings in the phone UI

The third navigation step is Fabric, with width in centimeters, length in meters, and a fabric type (including custom input). Layout JSON downloaded from the UI adds a separate `fabric` object with `width_mm`, `length_mm`, and `type` alongside the existing `pieces`. CLI and library exports retain the original piece-only contract. Fabric selection does not alter pattern ease or seam allowance.

The Pattern screen uses the Figma efficiency card, map, piece list and download dock. It previews actual generated SVG pieces and keeps efficiency/remnant values pending until a layout optimizer supplies a result; it does not claim that pieces have been nested on the fabric. SVG, PDF, specification and cutting notes remain accessible.
