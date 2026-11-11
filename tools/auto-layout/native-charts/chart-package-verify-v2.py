import importlib.util
import json
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('native_chart_package_core', Path(__file__).with_name('chart-package-verify.py'))
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
MAX_INPUT_BYTES = 8 * 1024 * 1024

if __name__ == '__main__':
    try:
        core.require(len(sys.argv) == 2 or len(sys.argv) == 3 and sys.argv[2] == '--strict-roots', 'CHART_USAGE')
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        core.require(len(raw) <= MAX_INPUT_BYTES, 'CHART_PROGRAM_BOUND')
        payload = json.loads(raw.decode('utf-8'))
        core.closed(payload, 'schema program manifest')
        core.require(payload['schema'] == 'native-chart-occurrence-inspection-v2', 'CHART_V2_SCHEMA')
        result = core.verify_occurrences(sys.argv[1], payload['program'], payload['manifest'], strict_roots=len(sys.argv) == 3)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (core.ChartPackageError, ValueError, KeyError, core.ET.ParseError,
            core.zipfile.BadZipFile, core.InvalidOperation, OverflowError, TypeError, IndexError) as error:
        print(json.dumps({'status': 'failed', 'error': str(error)}), file=sys.stderr)
        sys.exit(1)
