#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"
: > bundle.js
for file in "$SCRIPT_DIR"/*.js; do
  printf '// ==== START: %s ====\n' "$file" >> bundle.js
  cat "$file" >> bundle.js
  printf '\n// ==== END: %s ====\n\n' "$file" >> bundle.js
done
rm -f plugin.zip
touch -d '@0' plugin.yaml bundle.js
find "$SCRIPT_DIR" -type f -exec touch -d '@0' {} +
zip -X -q -r plugin.zip src/ bundle.js plugin.yaml
echo "Created $ROOT_DIR/plugin.zip"
