#!/bin/bash
set -e

OUTPUT_DIR="build/api-docs"
# Corrected package names based on your repo structure
PACKAGES=("adk" "core")

# Function to setup build environment
setup_build_env() {
    echo "Setting up build environment..."
    npm install
    # Build the workspace to ensure internal dependencies are resolved
    npm run build || echo "Build script failed, attempting to continue..."
    echo "Environment setup complete!"
}

# Generic function to build documentation for a package
generate_package_docs() {
    local PKG_NAME=$1
    local VERSION_TAG=$2
    local ENTRY_POINT=$3

    local OUTPUT_SUBDIR="$OUTPUT_DIR/$VERSION_TAG/$PKG_NAME"
    
    echo "  Generating TypeDoc for $PKG_NAME ($VERSION_TAG)..."
    mkdir -p "$OUTPUT_SUBDIR"

    # Build Documentation
    local STATUS=0
    npx typedoc \
        --options docs/typedoc.json \
        --entryPoints "$ENTRY_POINT" \
        --out "$OUTPUT_SUBDIR" \
        --name "Toolbox $PKG_NAME ($VERSION_TAG)" \
        --includeVersion >/dev/null 2>&1 || STATUS=$?

    if [ $STATUS -ne 0 ]; then
        echo "    Warning: TypeDoc build failed for $PKG_NAME ($VERSION_TAG)"
    fi
}

build_latest() {
    echo "Building 'latest' documentation..."
    for PKG in "${PACKAGES[@]}"; do
        # Matching your provided typedoc.json path: packages/toolbox-adk/src/toolbox_adk/index.ts
        local PKG_ENTRY="packages/toolbox-$PKG/src/toolbox_$PKG/index.ts"
        if [ -f "$PKG_ENTRY" ]; then
            generate_package_docs "$PKG" "latest" "$PKG_ENTRY"
        else
            echo "  Skipping $PKG (entry point not found at $PKG_ENTRY)"
        fi
    done
}

build_tags() {
    echo "Building documentation for tags..."
    local TAGS
    TAGS=$(git tag --sort=-v:refname)
    
    for TAG in $TAGS; do
        echo "Processing tag: $TAG"
        local WORKTREE_DIR=$(mktemp -d)
        
        if git worktree add "$WORKTREE_DIR" "$TAG" > /dev/null 2>&1; then
            # We don't necessarily need to npm install in every worktree if 
            # the current root's typedoc can read the old source files.
            for PKG in "${PACKAGES[@]}"; do
                local PKG_ENTRY="$WORKTREE_DIR/packages/toolbox-$PKG/src/toolbox_$PKG/index.ts"
                if [ -f "$PKG_ENTRY" ]; then
                    generate_package_docs "$PKG" "$TAG" "$PKG_ENTRY"
                fi
            done
            git worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1
        fi
        rm -rf "$WORKTREE_DIR"
    done
}

generate_registry() {
    echo "Generating versions.json..."
    node <<EOF > "$OUTPUT_DIR/versions.json"
const { execSync } = require('child_process');
try {
    const tags = execSync('git tag --sort=-v:refname').toString().trim().split('\n').filter(t => t);
    console.log(JSON.stringify(['latest', ...tags]));
} catch (e) {
    console.log(JSON.stringify(['latest']));
}
EOF
}

copy_assets() {
    echo "Copying static assets..."
    cp docs/templates/index.html "$OUTPUT_DIR/index.html"
    # Ensure GitHub Pages doesn't ignore files starting with underscores
    touch "$OUTPUT_DIR/.nojekyll"
}

# --- Main Execution ---
mkdir -p "$OUTPUT_DIR"
setup_build_env
build_latest
build_tags
generate_registry
copy_assets

echo "Documentation build complete! Output in $OUTPUT_DIR"
