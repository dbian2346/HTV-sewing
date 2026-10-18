"""Pack top-level pattern-piece SVGs into a compact fabric layout.

The source SVGs produced by Pattern Studio contain one top-level ``<g>`` per
piece. Each group already has a transform from the preview's vertical stack;
that transform must be replaced (rather than nested) when making a cutting
layout.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from dataclasses import dataclass
import math
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET


DEFAULT_INPUT = Path("sven.svg")
DEFAULT_OUTPUT = Path("optimized_layout.svg")
DEFAULT_GAP_MM = 2.0
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def svg_tag(name: str) -> str:
    return f"{{{SVG_NS}}}{name}"


@dataclass(frozen=True)
class PatternPiece:
    id: str
    element: ET.Element
    width: float
    height: float


@dataclass(frozen=True)
class Placement:
    piece: PatternPiece
    x: float
    y: float
    width: float
    height: float
    rotated: bool = False


@dataclass(frozen=True)
class _FreeRectangle:
    x: float
    y: float
    width: float
    height: float

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height


_DRAWABLE_TAGS = {
    svg_tag(name)
    for name in ("path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "use", "image")
}


def _has_drawable_geometry(element: ET.Element, in_defs: bool = False) -> bool:
    """Return whether an element has actual artwork outside reusable definitions."""
    in_defs = in_defs or element.tag == svg_tag("defs")
    if not in_defs and element.tag in _DRAWABLE_TAGS:
        display = element.get("display", "").strip().lower()
        style = element.get("style", "").replace(" ", "").lower()
        classes = set(element.get("class", "").split())
        if display != "none" and "display:none" not in style and "hidden" not in classes:
            return True
    return any(_has_drawable_geometry(child, in_defs) for child in element)


def _dimension(value: str | None, fallback: float | None = None) -> float:
    if value is None:
        if fallback is None:
            raise ValueError("Missing SVG piece dimension.")
        return fallback
    match = re.fullmatch(r"\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm)?\s*", value)
    if not match:
        raise ValueError(f"Unsupported SVG piece dimension: {value!r}; expected millimetres.")
    result = float(match.group(1))
    if not math.isfinite(result) or result <= 0:
        raise ValueError(f"SVG piece dimensions must be finite and positive, got {value!r}.")
    return result


def get_piece_groups(root: ET.Element, warnings: list[str] | None = None) -> list[PatternPiece]:
    """Read drawable top-level pattern groups from a Pattern Studio SVG.

    Only direct children are considered. This avoids mistaking internal
    FreeSewing groups and reusable SVG definitions for separate pieces.
    """
    pieces: list[PatternPiece] = []
    seen_ids: set[str] = set()
    notices = warnings if warnings is not None else []

    for group in root.findall(svg_tag("g")):
        piece_id = group.get("id", "").strip()
        nested_svg = group.find(svg_tag("svg"))
        if not piece_id or nested_svg is None:
            continue
        if piece_id in seen_ids:
            raise ValueError(f"Duplicate top-level pattern piece id: {piece_id}")
        seen_ids.add(piece_id)
        if not _has_drawable_geometry(nested_svg):
            notices.append(f"Skipped {piece_id}: its SVG group has no drawable pattern geometry.")
            continue

        view_box = nested_svg.get("viewBox", "").replace(",", " ").split()
        fallback_width = fallback_height = None
        if len(view_box) == 4:
            try:
                fallback_width, fallback_height = float(view_box[2]), float(view_box[3])
            except ValueError:
                pass
        width = _dimension(nested_svg.get("width"), fallback_width)
        height = _dimension(nested_svg.get("height"), fallback_height)
        pieces.append(PatternPiece(piece_id, group, width, height))

    return pieces


def _intersects(a: _FreeRectangle, b: _FreeRectangle, epsilon: float = 1e-9) -> bool:
    return not (
        a.right <= b.x + epsilon
        or b.right <= a.x + epsilon
        or a.bottom <= b.y + epsilon
        or b.bottom <= a.y + epsilon
    )


def _contains(outer: _FreeRectangle, inner: _FreeRectangle, epsilon: float = 1e-9) -> bool:
    return (
        inner.x >= outer.x - epsilon
        and inner.y >= outer.y - epsilon
        and inner.right <= outer.right + epsilon
        and inner.bottom <= outer.bottom + epsilon
    )


def _split_free_rectangles(
    free_rectangles: list[_FreeRectangle], used: _FreeRectangle
) -> list[_FreeRectangle]:
    split: list[_FreeRectangle] = []
    for free in free_rectangles:
        if not _intersects(free, used):
            split.append(free)
            continue

        if used.x > free.x:
            split.append(_FreeRectangle(free.x, free.y, used.x - free.x, free.height))
        if used.right < free.right:
            split.append(_FreeRectangle(used.right, free.y, free.right - used.right, free.height))
        if used.y > free.y:
            split.append(_FreeRectangle(free.x, free.y, free.width, used.y - free.y))
        if used.bottom < free.bottom:
            split.append(_FreeRectangle(free.x, used.bottom, free.width, free.bottom - used.bottom))

    split = [rectangle for rectangle in split if rectangle.width > 1e-9 and rectangle.height > 1e-9]
    pruned: list[_FreeRectangle] = []
    for index, rectangle in enumerate(split):
        if any(index != other and _contains(candidate, rectangle) for other, candidate in enumerate(split)):
            continue
        pruned.append(rectangle)
    return pruned


def _pack_in_order(
    pieces: list[PatternPiece], fabric_width_mm: float, gap_mm: float, allow_rotation: bool
) -> tuple[list[Placement], float]:
    # An intentionally generous finite height turns MaxRects into a strip packer.
    maximum_height = gap_mm + sum(max(piece.width, piece.height) + gap_mm for piece in pieces)
    free_rectangles = [
        _FreeRectangle(gap_mm, gap_mm, fabric_width_mm - gap_mm, maximum_height)
    ]
    placements: list[Placement] = []
    used_height = gap_mm

    for piece in pieces:
        orientations = [(piece.width, piece.height, False)]
        if allow_rotation and not math.isclose(piece.width, piece.height):
            orientations.append((piece.height, piece.width, True))

        best: tuple[tuple[float, ...], _FreeRectangle, float, float, bool] | None = None
        for free in free_rectangles:
            for width, height, rotated in orientations:
                slot_width, slot_height = width + gap_mm, height + gap_mm
                if slot_width > free.width + 1e-9 or slot_height > free.height + 1e-9:
                    continue
                score = (
                    max(used_height, free.y + height),
                    free.y,
                    min(free.width - slot_width, free.height - slot_height),
                    max(free.width - slot_width, free.height - slot_height),
                    free.x,
                    1.0 if rotated else 0.0,
                )
                if best is None or score < best[0]:
                    best = (score, free, width, height, rotated)

        if best is None:
            raise ValueError(
                f"{piece.id} ({piece.width:.2f} x {piece.height:.2f} mm) does not fit "
                f"within {fabric_width_mm:.2f} mm fabric width and {gap_mm:.2f} mm clearance."
            )

        _, free, width, height, rotated = best
        placement = Placement(piece, free.x, free.y, width, height, rotated)
        placements.append(placement)
        used = _FreeRectangle(free.x, free.y, width + gap_mm, height + gap_mm)
        free_rectangles = _split_free_rectangles(free_rectangles, used)
        used_height = max(used_height, placement.y + placement.height)

    layout_height = used_height + gap_mm
    return placements, layout_height


def make_layout(
    pieces: list[PatternPiece],
    fabric_width_cm: float,
    gap_cm: float = DEFAULT_GAP_MM / 10,
    allow_rotation: bool = False,
) -> tuple[list[Placement], float]:
    """Pack all pieces without overlap and return placements plus used length.

    Multiple deterministic orderings are tried because no single greedy order
    is best for every set of pattern pieces. Rotation is opt-in: turning a
    sewing piece can violate its grainline, nap or directional print.
    """
    fabric_width_mm = fabric_width_cm * 10
    gap_mm = gap_cm * 10
    if not math.isfinite(fabric_width_mm) or fabric_width_mm <= 0:
        raise ValueError("Fabric width must be a finite positive number.")
    if not math.isfinite(gap_mm) or gap_mm < 0:
        raise ValueError("Piece clearance must be a finite nonnegative number.")
    if not pieces:
        raise ValueError("No drawable pattern pieces were found in the SVG.")

    too_wide = [
        piece.id
        for piece in pieces
        if min(piece.width, piece.height) + 2 * gap_mm > fabric_width_mm
        if allow_rotation
    ] or [
        piece.id
        for piece in pieces
        if piece.width + 2 * gap_mm > fabric_width_mm
        if not allow_rotation
    ]
    if too_wide:
        raise ValueError(
            f"Pattern piece(s) too wide for this fabric: {', '.join(too_wide)}. "
            "No incomplete layout was written."
        )

    orderings = [
        sorted(pieces, key=lambda piece: (piece.width * piece.height, piece.height, piece.width), reverse=True),
        sorted(pieces, key=lambda piece: (max(piece.width, piece.height), piece.width * piece.height), reverse=True),
        sorted(pieces, key=lambda piece: (piece.height, piece.width), reverse=True),
        sorted(pieces, key=lambda piece: (piece.width, piece.height), reverse=True),
    ]
    candidates = [
        _pack_in_order(order, fabric_width_mm, gap_mm, allow_rotation) for order in orderings
    ]
    placements, layout_height = min(
        candidates,
        key=lambda candidate: (
            candidate[1],
            max(placement.x + placement.width for placement in candidate[0]),
            tuple(placement.piece.id for placement in candidate[0]),
        ),
    )
    return placements, layout_height


def _number(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".")


def export_layout(
    placements: list[Placement],
    fabric_width_cm: float,
    layout_height: float,
    output_file: Path = DEFAULT_OUTPUT,
    gap_mm: float = DEFAULT_GAP_MM,
) -> None:
    """Write the packed SVG, replacing every source preview transform."""
    width = fabric_width_cm * 10
    output = ET.Element(
        svg_tag("svg"),
        {
            "width": f"{_number(width)}mm",
            "height": f"{_number(layout_height)}mm",
            "viewBox": f"0 0 {_number(width)} {_number(layout_height)}",
            "data-piece-clearance-mm": _number(gap_mm),
        },
    )
    ET.SubElement(output, svg_tag("title")).text = "Compact pattern cutting layout"
    ET.SubElement(
        output,
        svg_tag("rect"),
        {
            "x": "0",
            "y": "0",
            "width": _number(width),
            "height": _number(layout_height),
            "fill": "#f4e5c8",
            "stroke": "#333333",
            "stroke-width": "1",
        },
    )

    for placement in placements:
        group = deepcopy(placement.piece.element)
        if placement.rotated:
            # A clockwise quarter-turn maps the original box into the packed box.
            transform = (
                f"translate({_number(placement.x + placement.width)} {_number(placement.y)}) rotate(90)"
            )
        else:
            transform = f"translate({_number(placement.x)} {_number(placement.y)})"
        group.set("transform", transform)
        group.set("data-layout-piece", placement.piece.id)
        group.set("data-layout-rotated", "true" if placement.rotated else "false")
        output.append(group)

    output_file.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(output).write(output_file, encoding="utf-8", xml_declaration=True)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Pack Pattern Studio SVG pieces onto fabric.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="source pattern SVG")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="packed SVG to write")
    parser.add_argument("--fabric-width-cm", type=float, help="usable fabric width in centimetres")
    parser.add_argument(
        "--gap-mm",
        type=float,
        default=DEFAULT_GAP_MM,
        help=f"clearance between pieces in millimetres (default: {DEFAULT_GAP_MM:g})",
    )
    parser.add_argument(
        "--allow-rotation",
        action="store_true",
        help="allow 90-degree turns; only use when grain, nap and print direction permit it",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.input.exists():
        print(f"Could not find input SVG: {args.input}", file=sys.stderr)
        return 1
    if args.fabric_width_cm is None:
        try:
            args.fabric_width_cm = float(input("Fabric width (cm): "))
        except (EOFError, ValueError):
            print("Fabric width must be a number.", file=sys.stderr)
            return 1

    try:
        root = ET.parse(args.input).getroot()
        warnings: list[str] = []
        pieces = get_piece_groups(root, warnings)
        placements, layout_height = make_layout(
            pieces,
            args.fabric_width_cm,
            gap_cm=args.gap_mm / 10,
            allow_rotation=args.allow_rotation,
        )
        export_layout(
            placements,
            args.fabric_width_cm,
            layout_height,
            output_file=args.output,
            gap_mm=args.gap_mm,
        )
    except (ET.ParseError, OSError, ValueError) as error:
        print(f"Could not create layout: {error}", file=sys.stderr)
        return 1

    for warning in warnings:
        print(f"Warning: {warning}", file=sys.stderr)
    if args.allow_rotation:
        print("Warning: 90-degree rotation was enabled; verify every grainline and fabric direction.")

    fabric_width_mm = args.fabric_width_cm * 10
    piece_area = sum(placement.width * placement.height for placement in placements)
    efficiency = 100 * piece_area / (fabric_width_mm * layout_height)
    print(f"Found and placed {len(placements)} drawable pattern pieces.")
    print(f"Required fabric length: {layout_height / 10:.1f} cm")
    print(f"Bounding-box utilization: {efficiency:.1f}%")
    print(f"Piece clearance: {args.gap_mm:g} mm")
    print(f"Layout saved to: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
