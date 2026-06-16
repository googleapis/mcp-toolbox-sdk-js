#!/bin/bash
set -euo pipefail

PACKAGE="${1:?package required (core|adk)}"
VERSION="${2:?version required (e.g. v1.0.0 or dev)}"
BASE_URL="${3:-/}"

# Map the URL slug to its package title, tsconfig and TypeDoc entry points.
# core exposes a secondary ./auth export (authMethods.ts) alongside the main
# index, so it has two entry points; adk has a single index.
case "$PACKAGE" in
  core)
    TITLE="Core"
    TSCONFIG="packages/toolbox-core/tsconfig.esm.json"
    ENTRIES=(packages/toolbox-core/src/toolbox_core/index.ts
             packages/toolbox-core/src/toolbox_core/authMethods.ts) ;;
  adk)
    TITLE="ADK"
    TSCONFIG="packages/toolbox-adk/tsconfig.esm.json"
    ENTRIES=(packages/toolbox-adk/src/toolbox_adk/index.ts) ;;
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
trap 'rm -rf "$CONTENT_DIR"' EXIT

# Generate a markdown tree (unlike gomarkdoc's single stream, typedoc emits many
# files). --entryFileName _index.md makes each module index a Hugo section page
# AND points cross-page links at _index.md so they resolve; --readme none keeps
# the repo README out (it is rendered separately at the site root).
npx typedoc \
  --plugin typedoc-plugin-markdown \
  --tsconfig "${TSCONFIG}" \
  --out "${CONTENT_DIR}" \
  --readme none \
  --entryFileName _index.md \
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
