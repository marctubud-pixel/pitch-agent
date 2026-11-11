#!/usr/bin/env python3
"""Exercise the CLI against real isolated Git indexes and selected checkouts."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

CHECKER = Path(__file__).with_name('check-repository.py')


class RepositorySelectionChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pitch-repository-check-')
        self.root = Path(self.temp.name)
        files = {
            'README.md': '# Synthetic repository\n',
            'CONTRIBUTING.md': '# Synthetic contribution guide\n',
            'docs/architecture/runtime.md': '# Synthetic runtime\n',
            'scripts/spec-upload-files.json': '{"files": []}',
            'docs/development/source-import.json': '{"files": [], "adaptations": {}}',
            'apps/workbench-preview/test-fixtures/provenance/manifest.json': '[]',
        }
        for name, content in files.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        shutil.copyfile(CHECKER, self.root / 'scripts/check-repository.py')
        self.selected = sorted([*files, 'scripts/check-repository.py', 'scripts/repository-files.json'])
        self.write_selection()
        self.git('init', '-q')
        self.git('add', '.')

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        subprocess.run(['git', '-C', str(self.root), *args], check=True, capture_output=True)

    def write_selection(self):
        (self.root / 'scripts/repository-files.json').write_text(json.dumps({'files': self.selected}))

    def check(self):
        return subprocess.run(['python3', str(self.root / 'scripts/check-repository.py')], capture_output=True, text=True)

    def test_exact_git_selection_passes(self):
        result = self.check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)['gitSelectionChecked'])

    def test_unlisted_staged_file_is_rejected(self):
        (self.root / 'unexpected.txt').write_text('Synthetic unlisted file')
        self.git('add', 'unexpected.txt')
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('unlistedTracked', result.stderr)
        self.assertIn('unexpected.txt', result.stderr)

    def test_selected_but_untracked_file_is_rejected(self):
        (self.root / 'missing-from-index.txt').write_text('Synthetic selected file')
        self.selected.append('missing-from-index.txt')
        self.write_selection()
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('selectedNotTracked', result.stderr)
        self.assertIn('missing-from-index.txt', result.stderr)

    def test_export_without_git_checks_manifest_only(self):
        (self.root / '.git').rename(self.root / 'isolated-git-index')
        result = self.check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(result.stdout)['gitSelectionChecked'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
