import tempfile
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

from main import (
    SVG_NS,
    PatternPiece,
    export_layout,
    get_piece_groups,
    make_layout,
)


def tag(name: str) -> str:
    return f"{{{SVG_NS}}}{name}"


def piece(piece_id: str, width: float, height: float) -> PatternPiece:
    group = ET.Element(tag("g"), {"id": piece_id, "transform": "translate(999 999)"})
    nested = ET.SubElement(
        group,
        tag("svg"),
        {"width": str(width), "height": str(height), "viewBox": f"0 0 {width} {height}"},
    )
    ET.SubElement(nested, tag("path"), {"d": f"M 0 0 H {width} V {height} Z"})
    return PatternPiece(piece_id, group, width, height)


class LayoutOptimizerTests(unittest.TestCase):
    def test_discovers_generic_top_level_pieces_and_ignores_empty_placeholders(self):
        root = ET.Element(tag("svg"))
        root.append(piece("coat.front", 100, 200).element)
        empty = ET.SubElement(root, tag("g"), {"id": "coat.empty"})
        nested = ET.SubElement(empty, tag("svg"), {"width": "16", "height": "28"})
        defs = ET.SubElement(nested, tag("defs"))
        ET.SubElement(defs, tag("path"), {"d": "M 0 0 L 1 1"})
        notices: list[str] = []

        pieces = get_piece_groups(root, notices)

        self.assertEqual([item.id for item in pieces], ["coat.front"])
        self.assertIn("no drawable pattern geometry", notices[0])

    def test_compact_layout_is_in_bounds_and_respects_clearance(self):
        pieces = [
            piece("a", 620, 420),
            piece("b", 360, 520),
            piece("c", 340, 240),
            piece("d", 210, 180),
            piece("e", 180, 130),
        ]
        gap = 2.0
        placements, height = make_layout(pieces, 100, gap_cm=gap / 10)

        self.assertLess(height, sum(item.height for item in pieces) + gap * (len(pieces) + 1))
        for item in placements:
            self.assertGreaterEqual(item.x, gap)
            self.assertGreaterEqual(item.y, gap)
            self.assertLessEqual(item.x + item.width, 1000 - gap + 1e-7)
            self.assertLessEqual(item.y + item.height, height - gap + 1e-7)
        for index, left in enumerate(placements):
            for right in placements[index + 1 :]:
                separated = (
                    left.x + left.width + gap <= right.x + 1e-7
                    or right.x + right.width + gap <= left.x + 1e-7
                    or left.y + left.height + gap <= right.y + 1e-7
                    or right.y + right.height + gap <= left.y + 1e-7
                )
                self.assertTrue(separated, f"{left.piece.id} overlaps {right.piece.id}")

    def test_export_replaces_stale_source_transforms(self):
        source = piece("dress.front", 100, 200)
        placements, height = make_layout([source], 50)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory, "layout.svg")
            export_layout(placements, 50, height, output)
            root = ET.parse(output).getroot()
            group = root.find(tag("g"))
            self.assertIsNotNone(group)
            self.assertEqual(group.get("transform"), "translate(2 2)")
            self.assertNotIn("999", group.get("transform", ""))

    def test_real_sven_layout_has_no_phantom_pieces_or_vertical_stack_offsets(self):
        root = ET.parse(Path(__file__).with_name("sven.svg")).getroot()
        notices: list[str] = []
        pieces = get_piece_groups(root, notices)
        placements, height = make_layout(pieces, 140)

        self.assertEqual([item.id for item in pieces], ["sven.front", "sven.back", "sven.sleeve"])
        self.assertEqual(len(notices), 2)
        self.assertLess(height, 1230)
        self.assertTrue(all(item.y < 20 for item in placements))

    def test_never_silently_drops_a_piece_that_is_too_wide(self):
        with self.assertRaisesRegex(ValueError, "too wide"):
            make_layout([piece("wide", 1200, 100)], 100)

    def test_rotation_is_opt_in(self):
        wide = piece("wide", 1200, 100)
        with self.assertRaisesRegex(ValueError, "too wide"):
            make_layout([wide], 100)
        placements, _ = make_layout([wide], 100, allow_rotation=True)
        self.assertTrue(placements[0].rotated)
        self.assertEqual((placements[0].width, placements[0].height), (100, 1200))


if __name__ == "__main__":
    unittest.main()
