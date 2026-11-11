#!/usr/bin/env python3
"""Exercise drift guards in a portable, disposable copy of the real baseline."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SpecificationChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='proposal-specs-')
        self.root = Path(self.temp.name)
        for name in json.loads((ROOT / 'scripts/spec-upload-files.json').read_text())['files']:
            source = ROOT / name
            if source.is_file():
                target = self.root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
        self.env = dict(os.environ)
        native = '/Library/Developer/CommandLineTools/usr/bin'
        if Path(native, 'git').exists():
            self.env['PATH'] = native + os.pathsep + self.env['PATH']

    def tearDown(self):
        self.temp.cleanup()

    def run_check(self, *args):
        return subprocess.run([os.sys.executable, 'scripts/check-specs.py', *args], cwd=self.root,
                              env=self.env, capture_output=True, text=True)

    def test_clean_selected_checkout_passes(self):
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_changed_requirement_is_not_silently_accepted(self):
        path = self.root / 'docs/pages/brief.md'
        path.write_text(path.read_text() + '\n未登记的新要求\n')
        result = self.run_check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Lock differs', result.stderr)

    def test_unversioned_method_reference_change_is_detected(self):
        path = self.root / 'skills/design-research-lead/references/review.md'
        path.write_text(path.read_text() + '\n未经登记的放宽\n')
        result = self.run_check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Fixed method snapshot differs', result.stderr)

    def test_missing_screenshot_fails(self):
        path = json.loads((self.root / 'docs/specs/screenshot-provenance.json').read_text())[0]['path']
        (self.root / path).unlink()
        result = self.run_check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Missing or nonlocal', result.stderr)

    def test_broken_page_reference_fails_even_when_freezing(self):
        path = self.root / 'docs/pages/brief.md'
        path.write_text(path.read_text() + '\n[丢失规范](missing.md)\n')
        result = self.run_check('--freeze')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Broken local link', result.stderr)

    def test_refreshed_lock_cannot_hide_missing_version_bump(self):
        for args in [('init', '-q'), ('add', '.'), ('-c', 'user.name=Spec Test', '-c', 'user.email=spec-test@invalid', 'commit', '-qm', 'fixture baseline')]:
            result = subprocess.run(['git', *args], cwd=self.root, env=self.env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        result = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=self.root, env=self.env, capture_output=True, text=True)
        base = result.stdout.strip()
        path = self.root / 'docs/pages/brief.md'
        path.write_text(path.read_text() + '\n登记但未升版本的变更\n')
        self.assertEqual(self.run_check('--freeze').returncode, 0)
        result = self.run_check('--base', base)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('higher version: page.brief', result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
