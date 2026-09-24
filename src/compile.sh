#!/bin/bash
set -e

echo "Generating bundle.js from src/*.js..."
: > bundle.js

for file in ./src/*.js; do
  echo "// ==== START: $file ====" >> bundle.js
  cat "$file" >> bundle.js
  echo -e "\n// ==== END: $file ===\n" >> bundle.js
done

echo "Creating installable plugin zip..."
rm -f plugin.zip
zip -X -j plugin.zip plugin.yaml bundle.js

echo "Done!"
ls -l plugin.zip
