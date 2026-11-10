from __future__ import annotations

import argparse
from pathlib import Path

import fitz


def main():
    parser = argparse.ArgumentParser(description="Render every PDF page to PNG for visual QA.")
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--dpi", type=int, default=150)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    document = fitz.open(args.input_pdf)
    matrix = fitz.Matrix(args.dpi / 72, args.dpi / 72)
    for index, page in enumerate(document, start=1):
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        pixmap.save(args.output_dir / f"page-{index}.png")
    print(f"Rendered {len(document)} pages from {args.input_pdf}")


if __name__ == "__main__":
    main()
