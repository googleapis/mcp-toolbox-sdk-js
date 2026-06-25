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

case "$PACKAGE" in
  core)
    TITLE="Core"
    PKG_DIR="packages/toolbox-core"
    SRC_DIR="${PKG_DIR}/src/toolbox_core" ;;
  adk)
    TITLE="ADK"
    PKG_DIR="packages/toolbox-adk"
    SRC_DIR="${PKG_DIR}/src/toolbox_adk" ;;
  *) echo "Unknown package: $PACKAGE" >&2; exit 1 ;;
esac
TSCONFIG="${PKG_DIR}/tsconfig.esm.json"

npm ci

# Per-build content in a temp dir so concurrent package builds don't collide.
CONTENT_DIR="$(mktemp -d)"
# Absolute path: the cleanup trap fires after the script cd's into docs-site.
BARREL="$(pwd)/${SRC_DIR}/__typedoc_entry.ts"
# return 0: a cleanup failure shouldn't override the script's exit code.
cleanup() { rm -rf "$CONTENT_DIR" "$BARREL"; return 0; }
trap cleanup EXIT

# Public modules from package.json "exports" (build/esm/<name>.js -> <name>), so
# a new subpath export is documented automatically with no edit here.
MODULES="$(node -e "const {exports}=require('./${PKG_DIR}/package.json'); process.stdout.write(Object.values(exports).map(e=>e.import.replace('./build/esm/','').replace('.js','')).join(' '))")"

# Re-export every module through one barrel (in src, so relative paths resolve) so
# TypeDoc renders the package as one page, not a page per entry point. printf
# repeats its format once per module.
printf "export * from './%s.js';\n" $MODULES > "$BARREL"
ENTRIES=("$BARREL")

# Render the package as one scrollable markdown page, matching the Go SDK:
# - outputFileStrategy modules: one page per module, not per symbol
# - entryFileName _index.md: that page is the Hugo section index for /<pkg>/<version>/
# - hidePageTitle: drop TypeDoc's H1 so the Docsy frontmatter title is the only heading
# - useCodeBlocks: fenced ```ts signatures/types, not inline-backtick blockquotes
# - disableSources / notRenderedTags @throws: drop the "Defined in" links and "Throws"
#   sections the Go SDK omits
# - readme none: the README is rendered separately at the site root
# - parametersFormat table: params as a table
# - typeDeclarationVisibility compact: collapse nested anonymous types to one line
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

# Prepend Docsy frontmatter to the single generated page (title "<Title> (<version>)").
PAGE="${CONTENT_DIR}/_index.md"
tmp="$(mktemp)"
{ printf -- '---\ntitle: "%s"\ntype: docs\n---\n\n' "${TITLE} (${VERSION})"; cat "${PAGE}"; } > "$tmp"
mv "$tmp" "${PAGE}"

cd docs-site
HUGO_PARAMS_VERSION="${VERSION}" HUGO_PARAMS_PACKAGE="${PACKAGE}" hugo \
  --minify \
  --contentDir "${CONTENT_DIR}" \
  --baseURL "${BASE_URL}${PACKAGE}/${VERSION}/" \
  --destination "public/${PACKAGE}/${VERSION}"

# Hoist home-scoped outputs to the package root, where the navbar version selector
# fetches them. They list every version, so they live once per package, not per
# version. keep_files on deploy preserves them.
mv "public/${PACKAGE}/${VERSION}/releases.releases" "public/${PACKAGE}/releases.releases"
mkdir -p "public/${PACKAGE}/latest"
mv "public/${PACKAGE}/${VERSION}/latest.html" "public/${PACKAGE}/latest/index.html"
