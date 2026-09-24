#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
: > bundle.js
for file in ./src/*.js; do
  printf '// ==== START: %s ====\n' "$file" >> bundle.js
  cat "$file" >> bundle.js
  printf '\n// ==== END: %s ====\n\n' "$file" >> bundle.js
done
rm -f plugin.zip
touch -d '@0' plugin.yaml bundle.js
find src -type f -exec touch -d '@0' {} +
zip -X -q -r plugin.zip src/ bundle.js plugin.yaml
sha256sum plugin.zip
