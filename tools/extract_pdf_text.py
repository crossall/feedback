import sys
from pathlib import Path

import pdfplumber


def main() -> None:
    path = Path(sys.argv[1])
    with pdfplumber.open(path) as pdf:
        print(f"pages {len(pdf.pages)}")
        for index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            print(f"\n--- PAGE {index} ---")
            print(text)


if __name__ == "__main__":
    main()
