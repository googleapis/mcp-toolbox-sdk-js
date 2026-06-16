#!/bin/bash
set -euo pipefail

BASE_URL="${1:-/}"

# Render the repo README (from the checked-out tag) as the root landing page.
# Built only on tag pushes so the root URL tracks the latest release and stays
# stable between main-branch dev builds.
CONTENT_DIR="$(mktemp -d)"
trap 'rm -rf "$CONTENT_DIR"' EXIT

cat > "$CONTENT_DIR/_index.md" <<EOF
---
title: "MCP Toolbox JS SDK"
type: docs
---
EOF
# Strip the README's leading H1 and its hand-maintained TOC block before
# appending: Docsy already renders the page title as an H1 and an "On this page"
# TOC, so leaving them in would duplicate both on the landing page.
awk '
  /<!-- TOC -->/ { intoc = 1 }
  intoc { if (/<!-- \/TOC -->/) intoc = 0; next }
  !h1done && /^# / { h1done = 1; next }
  { print }
' README.md >> "$CONTENT_DIR/_index.md"

cd docs-site
hugo \
  --minify \
  --contentDir "${CONTENT_DIR}" \
  --baseURL "${BASE_URL}" \
  --destination "public"
