"""按页型库生成可填写的客户提案提纲。"""

import argparse
import json
import unicodedata
from pathlib import Path


LIBRARY = Path(__file__).resolve().parents[1] / "references" / "page-library.json"
CHAPTERS = {
    "opening": "开场",
    "research": "研究",
    "strategy": "策略",
    "routes": "创意方向总览",
    "kv": "KV 方案",
    "packaging": "包装方案",
    "closing": "收尾",
}
NOTICE = "预编稿。页型提示供编稿人选用。请另写客户可见标题与上屏内容，登记材料出处、版本和缺件。"
OPTIONS = {
    "kv": ("process", "motion", "adaptation", "activation"),
    "packaging": ("series", "activation"),
}
SECOND_TOUCHPOINT = {"kv-second-use", "pack-second-use"}


def build(library, kind, directions, options, single_touchpoint):
    chapters = [(group, None) for group in ("opening", "research", "strategy", "routes")]
    chapters.extend((kind, direction) for direction in directions)
    chapters.append(("closing", None))
    pages, contents = [], []
    for group, direction in chapters:
        rows = [row for row in library["groups"][group]
                if ("when" not in row or row["when"] in options)
                and not (single_touchpoint and row["id"] in SECOND_TOUCHPOINT)]
        if not rows:
            continue
        chapter = CHAPTERS[group] + (f" · {direction}" if direction else "")
        contents.append({"chapter": chapter, "start_page": len(pages) + 1})
        for row in rows:
            instance_id = f"{group}/{row['id']}"
            if direction:
                # 保留中文可读性，同时区分名字中的斜线与本身含有 %2F 的名字。
                instance_id += "/" + direction.replace("%", "%25").replace("/", "%2F")
            pages.append({
                "page": len(pages) + 1,
                "chapter": chapter,
                "direction": direction,
                "instance_id": instance_id,
                "type_id": row["id"],
                **{key: row[key] for key in ("title", "fill", "material", "check", "template")},
                "client_title": "目录" if row["id"] == "toc" else "",
                "content": "",
                "material_ref": "",
                "status": "待填",
            })

    for page in pages:
        if page["type_id"] == "toc":
            page["content"] = "\n".join(
                f"{entry['chapter']}　P{entry['start_page']:02}" for entry in contents)
    return {"library_version": library["version"], "kind": kind, "notice": NOTICE,
            "contents": contents, "pages": pages}


def markdown(outline):
    kind = CHAPTERS[outline["kind"]]
    lines = [f"# {kind}逐页提纲", "", f"{NOTICE} 本稿共 {len(outline['pages'])} 页。"]
    for p in outline["pages"]:
        lines.extend([
            "", f"## P{p['page']:02}　{p['chapter']}", "",
            f"- 页型提示　{p['title']}（`{p['type_id']}`）",
            f"- 页实例　`{p['instance_id']}`",
            f"- 首选模板　`{p['template']['type']}.{p['template']['variant']}`",
            f"- 本页要填什么　{p['fill']}",
            f"- 所需材料　{p['material']}",
            f"- 审读时核对　{p['check']}",
            f"- 材料出处与版本　________　　状态　{p['status']}", "",
            f"**客户可见标题**　{p['client_title'] or '________'}", "",
            "**上屏内容／作品主体**", "",
            p["content"].replace("\n", "  \n") or "________",
        ])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", required=True, choices=("kv", "packaging"))
    parser.add_argument("--directions", required=True, nargs="+", metavar="方向名")
    parser.add_argument("--include", nargs="+", default=[], action="extend",
                        choices=sorted(set(OPTIONS["kv"]) | set(OPTIONS["packaging"])),
                        help="按委托增加页位；选中后仍需填写真实材料。")
    parser.add_argument("--single-touchpoint", action="store_true",
                        help="全案仅展示一个应用触点，省去每方向的第二触点页。")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    args = parser.parse_args()
    directions = [name.strip() for name in args.directions]
    if len(directions) not in (2, 3) or not all(directions):
        parser.error("请提供两到三个非空方向名。")
    names = {unicodedata.normalize("NFKC", name).casefold() for name in directions}
    if len(names) != len(directions):
        parser.error("同一份提纲中的方向名称须各不相同。")
    options = set(args.include)
    if options.difference(OPTIONS[args.kind]):
        parser.error(f"{CHAPTERS[args.kind]}提纲的可选项为 {', '.join(OPTIONS[args.kind])}。")

    library = json.loads(LIBRARY.read_text(encoding="utf-8"))
    outline = build(library, args.kind, directions, options, args.single_touchpoint)
    if args.format == "json":
        print(json.dumps(outline, ensure_ascii=False, indent=2))
    else:
        print(markdown(outline))


if __name__ == "__main__":
    main()
