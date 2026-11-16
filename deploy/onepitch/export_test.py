import json
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path

from export import export


class SnapshotTest(unittest.TestCase):
    def test_moves_project_history_and_standalone_file_together(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = str(uuid.uuid4())
            file_dir = root / project / "files"
            file_dir.mkdir(parents=True)
            (file_dir / "original").write_bytes(b"brief")
            state = {"id": project, "revision": 3, "versions": [{"attachments": [{"storageKey": "original"}]}]}
            with sqlite3.connect(root / "nightflight.sqlite") as db:
                db.execute("CREATE TABLE projects(id,revision,state)")
                db.execute("INSERT INTO projects VALUES (?,?,?)", (project, 3, json.dumps(state)))
                db.execute("CREATE TABLE library_files(id,name,bytes)")
                db.execute("INSERT INTO library_files VALUES(?,?,?)", ("a", "图.txt", b"library"))
            snapshot = root / "snapshot"
            export(snapshot, [root])
            with sqlite3.connect(snapshot / "nightflight.sqlite") as db:
                self.assertEqual(json.loads(db.execute("SELECT state FROM projects").fetchone()[0]), state)
                self.assertEqual(db.execute("SELECT name,bytes FROM library_files").fetchone(), ("图.txt", b"library"))
            self.assertEqual((snapshot / project / "files" / "original").read_bytes(), b"brief")


if __name__ == "__main__":
    unittest.main()
