"""Export immutable referenced project files and SQLite rows into a fresh data root."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import uuid

def storage_keys(value):
    if isinstance(value, dict):
        if "storageKey" in value:
            yield value["storageKey"]
        for item in value.values():
            yield from storage_keys(item)
    elif isinstance(value, list):
        for item in value:
            yield from storage_keys(item)

def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()

def export(target, roots):
    if target.exists():
        raise ValueError("目标目录已经存在，请使用新目录")
    with tempfile.TemporaryDirectory(dir=target.parent) as tmp:
        staging = Path(tmp) / "snapshot"
        staging.mkdir(mode=0o700)
        manifest = {}
        out = sqlite3.connect(staging / "nightflight.sqlite")
        try:
            out.execute("CREATE TABLE projects(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL)")
            out.execute("CREATE TABLE library_files(id TEXT PRIMARY KEY, name TEXT NOT NULL, bytes BLOB NOT NULL)")
            for root in roots:
                src = sqlite3.connect((root / "nightflight.sqlite").resolve().as_uri() + "?mode=ro", uri=True)
                try:
                    src.execute("BEGIN")
                    if src.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='library_files'").fetchone():
                        for row in src.execute("SELECT id,name,bytes FROM library_files"):
                            out.execute("INSERT INTO library_files VALUES(?,?,?)", row)
                    for key, revision, raw in src.execute("SELECT id,revision,state FROM projects"):
                        if key != str(uuid.UUID(key)):
                            raise ValueError("项目 ID 异常")
                        p = json.loads(raw)
                        if p["id"] != key or p["revision"] != revision:
                            raise ValueError("项目身份或版本不一致")
                        out.execute("INSERT INTO projects VALUES(?,?,?)", (key,revision,raw))
                        files = staging / key / "files"
                        files.mkdir(parents=True)
                        for name in sorted(set(storage_keys(p))):
                            if not name or Path(name).name != name or name in {".",".."}:
                                raise ValueError("附件文件名异常")
                            original = root / key / "files" / name
                            if original.is_symlink() or not original.is_file() or not original.resolve().is_relative_to(root.resolve()):
                                raise ValueError(f"缺失或异常附件 {key}/{name}")
                            dest = files / name
                            shutil.copyfile(original, dest)
                            fingerprint = digest(original)
                            if digest(dest) != fingerprint:
                                raise ValueError("附件摘要不一致")
                            manifest[f"{key}/files/{name}"] = fingerprint
                finally:
                    src.close()
            out.commit()
            print(out.execute("SELECT COUNT(*) FROM projects").fetchone()[0], "个项目，", len(manifest), "个已核对的文件")
        finally:
            out.close()
        (staging / "files.sha256.json").write_text(json.dumps(manifest, indent=2))
        staging.rename(target)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("python3 export.py 新目录 数据根目录 [其他数据根目录]")
    os.umask(0o077)
    export(Path(sys.argv[1]), [Path(p) for p in sys.argv[2:]])
