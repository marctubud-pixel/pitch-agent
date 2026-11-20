"""Read page evidence and assemble contact sheets from the Nightflight layout batch."""

import hashlib
import json
import posixpath
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def paragraphs(root):
    return [
        "".join(t.text or "" for t in paragraph.findall(".//a:t", NS))
        for paragraph in root.findall(".//a:p", NS)
    ]


def inspect(path):
    with ZipFile(path) as deck:
        def xml(part):
            if deck.getinfo(part).file_size > 10_000_000:
                raise ValueError("PowerPoint XML exceeds size limit")
            return ET.fromstring(deck.read(part))

        def relations(part):
            folder, name = posixpath.split(part)
            rels = xml(posixpath.join(folder, "_rels", name + ".rels"))
            return {
                item.attrib["Id"]: (
                    item.attrib["Type"].rsplit("/", 1)[-1],
                    posixpath.normpath(posixpath.join(folder, item.attrib["Target"])),
                )
                for item in rels if item.attrib.get("TargetMode") != "External"
            }

        def pages():
            presentation = "ppt/presentation.xml"
            ids = xml(presentation).findall("p:sldIdLst/p:sldId", NS)
            targets = relations(presentation)
            used = set()
            for slide in ids:
                kind, part = targets[slide.attrib["{" + NS["r"] + "}id"]]
                if kind != "slide" or part in used or not part.startswith("ppt/slides/"):
                    raise ValueError("Duplicate or invalid slide part")
                used.add(part)
                page = xml(part)
                targets_on_page = relations(part)
                pictures = []
                for pic in page.findall(".//p:pic", NS):
                    image = pic.find(".//a:blip", NS)
                    name = pic.find("p:nvPicPr/p:cNvPr", NS).attrib["name"]
                    kind, media = targets_on_page[image.attrib["{" + NS["r"] + "}embed"]]
                    if kind != "image" or not media.startswith("ppt/media/"):
                        raise ValueError("Invalid slide image")
                    pictures.append({"name": name, "sha256": hashlib.sha256(deck.read(media)).hexdigest()})
                notes = []
                for kind, part in targets_on_page.values():
                    if kind != "notesSlide":
                        continue
                    for shape in xml(part).findall(".//p:sp", NS):
                        placeholder = shape.find("p:nvSpPr/p:nvPr/p:ph", NS)
                        if placeholder is not None and placeholder.get("type") == "body":
                            notes.extend(paragraphs(shape))
                yield {
                    "text": paragraphs(page), "notes": notes, "images": pictures,
                    "charts": sum(kind == "chart" for kind, _ in targets_on_page.values()),
                    "shadows": len(page.findall(".//a:outerShdw", NS)),
                    "effects": [node.get("idx") for node in page.findall(".//a:effectRef", NS)],
                }
        return list(pages())


def contact(output, inputs):
    from PIL import Image, ImageDraw

    cols = min(4, len(inputs))
    rows = (len(inputs) + cols - 1) // cols
    width = min(304, 3600 // rows)
    height = width * 9 // 16 + 24
    sheet = Image.new("RGB", (cols * (width + 12) + 12, rows * height + 12), "#f3f3f3")
    draw = ImageDraw.Draw(sheet)
    for index, name in enumerate(inputs):
        x = 12 + index % cols * (width + 12)
        y = 8 + index // cols * height
        draw.text((x, y), f"P{index + 1:02d}", fill="#333333")
        with Image.open(name) as image:
            image.thumbnail((width, height - 24), Image.Resampling.LANCZOS)
            sheet.paste(image, (x + (width - image.width) // 2, y + 15))
    sheet.save(output, quality=88)


if __name__ == "__main__":
    action, file, *images = sys.argv[1:]
    if action == "inspect":
        print(json.dumps(inspect(Path(file)), ensure_ascii=False))
    elif action == "contact":
        contact(file, images)
    else:
        raise ValueError("Unsupported action")
