
import xml.etree.ElementTree as ET
from pathlib import Path
import re


INPUT_FILE = Path("sven.svg")
OUTPUT_FILE = Path("optimized_layout.svg")

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def get_piece_groups(root):
    """Find top-level FreeSewing pattern groups."""
    pieces = []

    for group in root.iter(f"{{{SVG_NS}}}g"):
        piece_id = group.get("id", "")

        if not re.fullmatch(r"sven\.[a-zA-Z0-9_-]+", piece_id):
            continue

        nested_svg = group.find(f"{{{SVG_NS}}}svg")
        if nested_svg is None:
            continue

        width = nested_svg.get("width", "0")
        height = nested_svg.get("height", "0")

        # SVG dimensions are normally in millimetres here.
        width = float(re.sub(r"mm$", "", width))
        height = float(re.sub(r"mm$", "", height))

        pieces.append({
            "id": piece_id,
            "element": group,
            "width": width,
            "height": height,
        })

    return pieces


def make_layout(pieces, fabric_width_cm, gap_cm=1):
    """Arrange piece viewBoxes in rows as a visual prototype."""
    fabric_width = fabric_width_cm * 10  # cm -> mm
    gap = gap_cm * 10

    x = gap
    y = gap
    row_height = 0
    placements = []

    for piece in sorted(
        pieces,
        key=lambda p: p["height"],
        reverse=True
    ):
        w = piece["width"]
        h = piece["height"]

        if w + 2 * gap > fabric_width:
            print(f"Too wide for fabric: {piece['id']}")
            continue

        if x + w + gap > fabric_width:
            x = gap
            y += row_height + gap
            row_height = 0

        placements.append({
            "piece": piece,
            "x": x,
            "y": y,
        })

        x += w + gap
        row_height = max(row_height, h)

    return placements, y + row_height + gap


def export_layout(placements, fabric_width_cm, layout_height):
    """Write a new SVG showing the arranged piece groups."""
    width = fabric_width_cm * 10

    output = ET.Element(
        f"{{{SVG_NS}}}svg",
        {
            "width": f"{width}mm",
            "height": f"{layout_height}mm",
            "viewBox": f"0 0 {width} {layout_height}",
        },
    )

    # Draw the fabric boundary.
    ET.SubElement(
        output,
        f"{{{SVG_NS}}}rect",
        {
            "x": "0",
            "y": "0",
            "width": str(width),
            "height": str(layout_height),
            "fill": "#f4e5c8",
            "stroke": "#333333",
            "stroke-width": "1",
        },
    )

    for item in placements:
        piece = item["piece"]
        group = ET.SubElement(
            output,
            f"{{{SVG_NS}}}g",
            {
                "transform": (
                    f"translate({item['x']}, {item['y']})"
                ),
                "data-piece": piece["id"],
            },
        )

        # Copy the original group so its paths and labels remain intact.
        group.append(piece["element"])

    ET.ElementTree(output).write(
        OUTPUT_FILE,
        encoding="utf-8",
        xml_declaration=True,
    )


def main():
    if not INPUT_FILE.exists():
        print("Could not find sven.svg in this folder.")
        return

    fabric_width_cm = float(input("Fabric width (cm): "))

    tree = ET.parse(INPUT_FILE)
    root = tree.getroot()

    pieces = get_piece_groups(root)

    if not pieces:
        print("No sven pattern groups found in the SVG.")
        return

    placements, layout_height = make_layout(
        pieces, fabric_width_cm
    )

    export_layout(
        placements, fabric_width_cm, layout_height
    )

    print(f"\nFound {len(pieces)} pattern groups.")
    print(f"Placed {len(placements)} groups.")
    print(f"Layout height: {layout_height / 10:.1f} cm")
    print(f"Visual output saved to: {OUTPUT_FILE.resolve()}")
    print("Open optimized_layout.svg in your browser to view it.")


if __name__ == "__main__":
    main()
