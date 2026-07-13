#!/bin/bash

echo "Run from root directory of the plugin for correct output!"

echo "Combining into bundle.js..."
: > bundle.js

{
  for file in ./src/*.js; do
    echo "// ==== START: $file ===="
    cat "$file"
    echo -e "\n// ==== END: $file ====\n"
  done
} >> bundle.js

echo "Compressing into plugin.zip..."
rm -f plugin.zip
# Set timestamps to 0 unix time for all files to achieve reproducible zip
touch -d "@0" ./plugin.yaml ./bundle.js
find ./src -exec touch -d "@0" {} \;
zip -X -r plugin.zip src/ bundle.js plugin.yaml

echo "Done! Plugin created: plugin.zip"
