#!/usr/bin/env bash
set -euo pipefail

# Always build relative to the repository root, regardless of where this script
# is invoked from (./src/compile.sh or from the root directory).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "Combining source files into bundle.js..."
: > bundle.js
for file in "$SCRIPT_DIR"/*.js; do
  printf '// ==== START: %s ====\n' "$file" >> bundle.js
  cat "$file" >> bundle.js
  printf '\n// ==== END: %s ====\n\n' "$file" >> bundle.js
done

echo "Compressing into plugin.zip..."
rm -f plugin.zip
# Set timestamps to zero for reproducible archives.
touch -d '@0' plugin.yaml bundle.js
find "$SCRIPT_DIR" -type f -exec touch -d '@0' {} +
zip -X -q -r plugin.zip src/ bundle.js plugin.yaml

echo "Done! Plugin created: plugin.zip"
ls -la plugin.zip
