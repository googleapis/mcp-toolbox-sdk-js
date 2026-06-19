#!/bin/bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -euo pipefail

PACKAGE="${1:?package required (core|adk)}"
VERSION="${2:?version required (e.g. v1.0.0 or dev)}"
BASE_URL="${3:-/}"

# Map the URL slug to its package title and tsconfig.
case "$PACKAGE" in
  core)
    TITLE="Core"
    TSCONFIG="packages/toolbox-core/tsconfig.esm.json" ;;
  adk)
    TITLE="ADK"
    TSCONFIG="packages/toolbox-adk/tsconfig.esm.json" ;;
  *) echo "Unknown package: $PACKAGE" >&2; exit 1 ;;
esac

# Install workspace deps from the lockfile. Besides providing typedoc (a root
# devDependency), this links the workspace symlinks so adk resolves its
# @toolbox-sdk/core types. Mirrors the Go script's `go install gomarkdoc`.
npm ci

# Per-build content tree in a temp dir, kept out of the checked-in
# docs-site/content so concurrent package builds never trample each other.
# The package's API reference is the home page, so /<pkg>/<version>/ lands
# directly on the docs (the repo README lives only at the site root).
CONTENT_DIR="$(mktemp -d)"
BARREL=""
# return 0 so a leftover non-zero (e.g. an empty BARREL test) never becomes the
# script's exit code, since an EXIT trap's last status replaces it.
cleanup() { rm -rf "$CONTENT_DIR"; [ -n "$BARREL" ] && rm -f "$BARREL"; return 0; }
trap cleanup EXIT

# Build the TypeDoc entry list. adk has a single entry point. core has two
# public entry points (the main index and the ./auth subpath); to render the
# whole package on one page, document both through a single temp barrel that
# re-exports them, so TypeDoc collapses the project into one module instead of
# emitting a separate page per entry point. The barrel lives in src (beside the
# files it re-exports so the relative paths resolve) and is removed on exit.
if [ "$PACKAGE" = core ]; then
  # Absolute path: the trap that removes it fires after the script cd's away.
  BARREL="$(pwd)/packages/toolbox-core/src/toolbox_core/__typedoc_entry.ts"
  printf "export * from './index.js';\nexport * from './authMethods.js';\n" > "$BARREL"
  ENTRIES=("$BARREL")
else
  ENTRIES=(packages/toolbox-adk/src/toolbox_adk/index.ts)
fi

# Generate the package's API reference as a single markdown page.
# --outputFileStrategy modules collapses every export onto its module's page
# (instead of one file per symbol), so each package renders on one scrollable
# page like the Go SDK. --entryFileName _index.md makes that page the Hugo
# section index for /<pkg>/<version>/. --hidePageTitle drops TypeDoc's own H1 so
# Docsy's frontmatter title ("<Title> (<version>)") is the sole page heading.
# --useCodeBlocks renders signatures, enum members and type declarations as
# fenced ```ts blocks (chroma-highlighted) instead of inline-backtick blockquotes,
# matching the Go SDK's signature/type formatting. --disableSources drops the
# per-symbol "Defined in: <file>:<line>" GitHub links, which the Go SDK docs do
# not show. --notRenderedTags @throws drops the per-function "Throws" section
# (the Go SDK has no such section; it folds error behaviour into prose). Together
# these leave only the info the Go SDK exposes: name, signature, description,
# parameters and return. --readme none keeps the repo README out (rendered
# separately at the site root).
# --parametersFormat table renders each method's parameters as a
# Parameter|Type|Description table instead of the default linear list.
# --typeDeclarationVisibility compact summarises nested anonymous types as a
# one-line JSON-ish blob instead of expanding every member inline. The tool
# factory (ToolboxTool) now has a named return type (the exported ToolboxTool
# interface in tool.ts), so loadTool/loadToolset/bindParam render as a linked
# `ToolboxTool` instead of a ~16-property anonymous blob; compact is kept as a
# safety net for any remaining nested anonymous types (e.g. Zod generics).
# (expandObjects/expandParameters are left at their false defaults so signature
# parentheses show parameter names only.)
npx typedoc \
  --plugin typedoc-plugin-markdown \
  --tsconfig "${TSCONFIG}" \
  --out "${CONTENT_DIR}" \
  --readme none \
  --entryFileName _index.md \
  --outputFileStrategy modules \
  --hidePageTitle \
  --useCodeBlocks \
  --disableSources \
  --notRenderedTags @throws \
  --parametersFormat table \
  --typeDeclarationVisibility compact \
  "${ENTRIES[@]}"

# Add Docsy frontmatter (type: docs + a title) to every generated .md. The
# package landing page gets the friendly "<Title> (<version>)"; other pages are
# titled after their file (or parent dir for an _index.md).
find "${CONTENT_DIR}" -type f -name '*.md' | while read -r f; do
  base="$(basename "$f" .md)"
  [ "$base" = "_index" ] && base="$(basename "$(dirname "$f")")"
  title="$base"
  [ "$f" = "${CONTENT_DIR}/_index.md" ] && title="${TITLE} (${VERSION})"
  tmp="$(mktemp)"
  { printf -- '---\ntitle: "%s"\ntype: docs\n---\n\n' "$title"; cat "$f"; } > "$tmp"
  mv "$tmp" "$f"
done

cd docs-site
HUGO_PARAMS_VERSION="${VERSION}" HUGO_PARAMS_PACKAGE="${PACKAGE}" hugo \
  --minify \
  --contentDir "${CONTENT_DIR}" \
  --baseURL "${BASE_URL}${PACKAGE}/${VERSION}/" \
  --destination "public/${PACKAGE}/${VERSION}"

# Hoist the home-scoped outputs from this version's dir up to the package root,
# where the navbar version selector fetches them. They list every version of the
# package, so they must live once per package (not per version) and are shared
# across all of this package's version pages. keep_files on deploy preserves them.
mv "public/${PACKAGE}/${VERSION}/releases.releases" "public/${PACKAGE}/releases.releases"
mkdir -p "public/${PACKAGE}/latest"
mv "public/${PACKAGE}/${VERSION}/latest.html" "public/${PACKAGE}/latest/index.html"
