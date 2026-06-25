# Development

This is the monorepo-level developer guide for `mcp-toolbox-sdk-js`. For
package-specific setup, testing, and linting, see each package's own guide:

* [`packages/toolbox-core/DEVELOPER.md`](packages/toolbox-core/DEVELOPER.md)
* [`packages/toolbox-adk/DEVELOPER.md`](packages/toolbox-adk/DEVELOPER.md)

General contribution guidelines (CLA, code review) live in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## API Reference Documentation

The API reference is published to [js.mcp-toolbox.dev](https://js.mcp-toolbox.dev).
It is generated with [TypeDoc](https://typedoc.org/) (via
[`typedoc-plugin-markdown`](https://typedoc-plugin-markdown.org/)) and rendered by
[Hugo](https://gohugo.io/) + [Docsy](https://www.docsy.dev/) from the `docs-site/`
directory. Docs are built **per package, per version** and served at
`/<package>/<version>/` (e.g. `/core/v1.0.0/`), with a `/<package>/latest/`
redirect to the newest release. `<package>` is the URL slug `core` or `adk`.

Each package renders as one page; `generate-api-docs.sh` derives the module list
from its `package.json` `exports`, so a new public subpath export is documented
automatically.

### Workflows

The `api-docs.yml` workflow deploys to the `gh-pages` branch. It runs only on
the upstream repository and uses the `api-docs-deploy` concurrency group, so it
never races another deploy.

The automatic flow is as follows:

* Push to `main` (or manual dispatch) → builds both packages as `dev`.
* Push of a per-package tag → builds that one version **and** rebuilds the root
  landing page. Tags are hyphenated: `core-vX.Y.Z` builds `core`, `adk-vX.Y.Z`
  builds `adk`.
* Other tags (e.g. `release-please-*`) are skipped.

Each build compiles the workspace first (`npm ci && npm run build`) so that
`adk`'s docs can resolve `@toolbox-sdk/core`'s exported types from its compiled
`build/esm/*.d.ts`; without it, TypeDoc fails with `TS2307`.

### Adding a new package

To document a new package with URL slug `<pkg>` (e.g. `foo`), wire the slug into
each list below. It must follow the directory convention
`packages/toolbox-<pkg>/src/toolbox_<pkg>` and have a `tsconfig.esm.json` plus a
`package.json` whose `exports` point at `./build/esm/<name>.js`.

1.  **`scripts/generate-api-docs.sh`** — add the slug and title to `TITLES`, e.g.
    `[foo]=Foo`. `PKG_DIR`, `SRC_DIR`, `TSCONFIG`, and the module list derive from
    the slug.
2.  **`api-docs.yml`** (deploy) — in the *Resolve* step's `case`, add a
    `refs/tags/foo-v*) … packages=foo …` arm and append `foo` to the `dev` default
    (`*) … packages=core adk foo …`).
3.  **`api-docs-backfill.yml`** (backfill) — add `foo` to the `package` input
    `options:` and a `foo) echo "dir=packages/toolbox-foo" …` arm in *Resolve
    package directory*. If it imports another package's types, add a dependency
    build mirroring the `if: inputs.package == 'adk'` step.
4.  **`docs-site/hugo.toml`** — add a `[[params.versions.foo]]` block (at least
    `dev`); see [Adding a version to the picker](#adding-a-version-to-the-picker).

### Adding a version to the picker

The version dropdown and the `/<package>/latest/` redirect are driven entirely by
the hand-edited `[params.versions.<pkg>]` list in `docs-site/hugo.toml` — not by
the build's version. Before each **new release**, add a `[[params.versions.<pkg>]]`
block for the version (newest first; the first non-`dev` entry becomes `latest`).

Add it in the **same commit you tag from**: the deploy reads `hugo.toml` from the
tagged ref and regenerates the dropdown/`latest` files in that run. Only list a
version whose `/<pkg>/<version>/` pages already exist (or will after this run), or
the dropdown link 404s.

### Backfilling old docs

Use the **`api-docs-backfill.yml`** (API Reference Backfill) workflow to publish
docs for a version whose pages are missing — typically releases that predate the
docs tooling, or a deployment that failed. It builds **one historical version per
run**.

Unlike `api-docs.yml`, this workflow does **not** deploy to production directly.
Each run opens a **pull request into the `gh-pages` branch**, so the docs are
reviewed before they go live. The page is published only when you merge that PR.

How a run works:

1.  It checks out `main` for the current docs tooling (layouts, scripts, version
    picker), then overlays the requested version's package **`src/`** from its
    release tag (`<pkg>-<version>`), so TypeDoc documents that version's API. Only
    `src/` is overlaid, so the root lockfile / `package.json` / `tsconfig` stay in
    sync and `npm ci` stays valid.
2.  For an `adk` backfill it builds `@toolbox-sdk/core` first (so `adk`'s docs
    resolve core's types); a `core` backfill needs no dependency build.
3.  It builds `/<package>/<version>/` (plus the package's `releases`/`latest`
    files), overlays it onto a clone of the live `gh-pages` tree — existing
    versions, `CNAME`, and `.nojekyll` are preserved — and opens a PR from branch
    `backfill/<pkg>-<ver>` with `gh-pages` as the base.

Steps to backfill:

1.  Make sure the version is listed in `docs-site/hugo.toml` (see
    [Adding a version to the picker](#adding-a-version-to-the-picker)), so the
    dropdown links to it.
2.  Trigger the workflow from the Actions tab, or with:

    ```bash
    gh workflow run api-docs-backfill.yml -f package=core -f version=v1.0.0
    ```

    To catch up several versions, dispatch it once per `package`/`version`. The
    concurrency group is scoped per version, so the runs are independent and none
    are cancelled — each opens its own PR.
3.  Review the resulting `backfill/<pkg>-<ver>` PR (the diff should be just that
    version's directory) and **merge it into `gh-pages`** to publish. Re-running
    the workflow for the same version updates the existing PR's branch.

#### Previewing a backfill PR

GitHub won't render the built HTML in the PR diff. Because the PR branch *is* the
rendered `gh-pages` tree, check it out and serve it statically — exactly what
Pages will serve after merge:

```bash
git fetch origin backfill/<pkg>-<ver>
# Check the branch out somewhere disposable (a detached worktree keeps your
# current branch untouched).
git worktree add --detach /tmp/preview-docs origin/backfill/<pkg>-<ver>
python3 -m http.server 8099 --directory /tmp/preview-docs
# → http://localhost:8099/<pkg>/<ver>/   e.g. http://localhost:8099/core/v0.3.0/
```

The version dropdown fetches `/<pkg>/releases.releases` at runtime, so links to
versions not present in this branch (other backfills) will 404 locally — that's
expected. When done, clean up:

```bash
git worktree remove /tmp/preview-docs
```

### Building locally

```bash
# Build a single package/version (base URL must end in a slash).
./scripts/generate-api-docs.sh core dev http://localhost:8080/

# Serve the output.
(cd docs-site/public && python3 -m http.server 8080)
# → http://localhost:8080/core/dev/
```

## Further Information

*   If you encounter issues, please open an
    [issue](https://github.com/googleapis/mcp-toolbox-sdk-js/issues).
