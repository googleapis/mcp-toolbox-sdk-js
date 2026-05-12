#!/bin/bash
set -e

VERSION=${1:-"main"}
BASE_URL=${2:-"/"}

rm -rf docs-site/content/*
mkdir -p docs-site/content/docs

cat <<EOF > docs-site/content/_index.md
---
title: "MCP Toolbox JS SDK"
type: docs
---

EOF

cat README.md >> docs-site/content/_index.md

cat <<EOF > docs-site/content/docs/_index.md
---
title: "Packages"
type: docs
weight: 1
alwaysopen: true
---
Select a package to view its public variables, functions, and classes.
EOF

generate_package() {
  local PKG_DIR=$1
  local TITLE=$2
  local WEIGHT=$3
  local MANUAL_VERSIONS=$4
  local MD_FILE="docs-site/content/docs/${PKG_DIR}.md"

  printf -- "---\ntitle: \"%s\"\ntype: docs\nweight: %s\n---\n\n" "$TITLE" "$WEIGHT" > "$MD_FILE"

  cat <<EOF >> "$MD_FILE"
<div style="margin-bottom: 2rem; padding: 1rem; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; display: inline-block;">
  <label for="${PKG_DIR}-version" style="font-weight: bold; margin-right: 10px; color: #4a4a4a;">Package Version:</label>
  
  <select id="${PKG_DIR}-version" onchange="if (this.value) window.location.href=this.value;" style="padding: 5px 10px; border-radius: 4px; border: 1px solid #ccc; background-color: white; color: #333333; cursor: pointer;">
    <option value="${BASE_URL}main/docs/${PKG_DIR}/">main (latest)</option>
EOF

  for VER in $MANUAL_VERSIONS; do
    echo "    <option value=\"${BASE_URL}${VER}/docs/${PKG_DIR}/\">${VER}</option>" >> "$MD_FILE"
  done

  cat <<EOF >> "$MD_FILE"
  </select>
</div>
EOF

  # Run TypeDoc for the package
  # We assume TypeDoc is installed and accessible via npx
  # We output to a temp directory and then append the relevant content
  mkdir -p "tmp_docs/${PKG_DIR}"
  
  # Find the entry point
  local ENTRY_POINT="packages/${PKG_DIR}/src/${PKG_DIR//-/_}/index.ts"
  # Replace hyphens with underscores for the inner directory name if necessary
  # toolbox-core -> toolbox_core
  
  echo "Running TypeDoc for ${PKG_DIR}..."
  npx typedoc --plugin typedoc-plugin-markdown --out "tmp_docs/${PKG_DIR}" "packages/${PKG_DIR}/src"
  
  # Append the generated content
  # TypeDoc usually generates modules.md or similar. We'll check for common names.
  if [ -f "tmp_docs/${PKG_DIR}/modules.md" ]; then
    cat "tmp_docs/${PKG_DIR}/modules.md" >> "$MD_FILE"
  elif [ -f "tmp_docs/${PKG_DIR}/index.md" ]; then
    cat "tmp_docs/${PKG_DIR}/index.md" >> "$MD_FILE"
  else
    echo "Warning: No modules.md or index.md found in tmp_docs/${PKG_DIR}"
    # List files to help debug
    ls -F "tmp_docs/${PKG_DIR}"
  fi
  
  rm -rf "tmp_docs/${PKG_DIR}"
}

generate_package "toolbox-core" "Core" "10" ""
generate_package "toolbox-adk" "ADK" "20" ""

# Setup docs-site if not exists
if [ ! -d "docs-site" ]; then
  echo "Please initialize the docs-site with Hugo first."
fi

# Build Hugo site (if docs-site exists)
if [ -d "docs-site" ]; then
  cd docs-site
  # Replace placeholder if needed, or use environment variables
  # For now, assuming hugo.toml is configured or will be handled by the workflow
  
  HUGO_PARAMS_VERSION="${VERSION}" hugo --minify --baseURL "${BASE_URL}${VERSION}/" --destination "public/${VERSION}"
  
  cat <<EOF > public/index.html
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=${BASE_URL}${VERSION}/" />
</head>
<body style="background-color: rgb(64, 63, 76); color: white; text-align: center; padding-top: 50px; font-family: sans-serif;">
  <p>Redirecting to the latest API version (${VERSION})...</p>
  <script>window.location.replace('${BASE_URL}${VERSION}/');</script>
</body>
</html>
EOF
fi
