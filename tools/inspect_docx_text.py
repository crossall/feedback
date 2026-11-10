import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def paragraph_text(paragraph: ET.Element) -> str:
    return "".join(text.text or "" for text in paragraph.findall(".//w:t", NS))


def main() -> None:
    path = Path(sys.argv[1])
    with zipfile.ZipFile(path) as archive:
        document_xml = archive.read("word/document.xml")

    root = ET.fromstring(document_xml)
    count = 0
    for index, paragraph in enumerate(root.findall(".//w:p", NS)):
        text = paragraph_text(paragraph)
        if text.strip():
            count += 1
            print(f"P{index}: {text}")
    print(f"count {count}")


if __name__ == "__main__":
    main()
