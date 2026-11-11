#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ ( $# -ne 8 && $# -ne 14 ) || "$3" != --brand || "$5" != --layout || "$7" != --validation ]]; then
  echo "Usage: $0 input.pptx fresh-output-directory --brand approved-brand.json --layout layout-manifest.json --validation build/validation.json [--ledger original-ledger.json --assets assets.json --chart-evidence native-chart-proof.json]" >&2
  exit 2
fi
RUNTIME="${CODEX_NATIVE_RUNTIME:-/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies}"
PYTHON="${NATIVE_CHECK_PYTHON:-$RUNTIME/python/bin/python3}"
SOFFICE="${NATIVE_CHECK_SOFFICE:-$RUNTIME/bin/override/soffice}"
FONTBIN="$RUNTIME/native/poppler/poppler/bin"
mkdir "$2"
OUT="$(cd "$2" && pwd)"
HELPER="$ROOT/tools/auto-layout/native-font-check.py"
if [[ $# -eq 14 ]]; then
  [[ "$9" == --ledger && "${11}" == --assets && "${13}" == --chart-evidence ]] || exit 2
  "$RUNTIME/node/bin/node" --max-old-space-size=512 "$ROOT/tools/auto-layout/native-numeric-preflight.mjs" --out "$OUT" --deck "$1" --brand "$4" --layout "$6" --validation "$8" --fc-scan "$FONTBIN/fc-scan" --fc-match "$FONTBIN/fc-match" --ledger "${10}" --assets "${12}" --chart-evidence "${14}"
else
  "$PYTHON" "$HELPER" preflight --out "$OUT" --deck "$1" --brand "$4" --layout "$6" --validation "$8" --fc-scan "$FONTBIN/fc-scan" --fc-match "$FONTBIN/fc-match"
fi
export FONTCONFIG_FILE="$OUT/fonts.conf"
export XDG_CACHE_HOME="$OUT/font-cache"
PROFILE="$($PYTHON -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).as_uri())' "$OUT/lo-profile")"
"$SOFFICE" --version > "$OUT/engine-version.txt" 2>&1
conversion=0
"$SOFFICE" "-env:UserInstallation=$PROFILE" --headless --convert-to pdf --outdir "$OUT" "$OUT/inputs/deck.pptx" > "$OUT/conversion.log" 2>&1 || conversion=$?
cat "$OUT/conversion.log"
status=0
"$PYTHON" "$HELPER" inspect --out "$OUT" --conversion-exit "$conversion" || status=$?
if [[ -s "$OUT/deck.pdf" ]]; then
  "$PYTHON" "$ROOT/tools/auto-layout/native-render-review.py" prepare --out "$OUT" --author-task-id "${NATIVE_CHECK_AUTHOR_TASK_ID:?Set actual author task identity}" || status=1
fi
if [[ $conversion -ne 0 ]]; then
  exit "$conversion"
fi
exit "$status"
