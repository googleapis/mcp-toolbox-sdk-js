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
directory. 

Docs are built **per package, per version** and served at
`/<package>/<version>/` (e.g. `/core/v1.0.0/`), with a `/<package>/latest/`
redirect to the newest release. `<package>` is the URL slug `core` or `adk`.

### Workflows

The [`api-docs.yml`](.github/workflows/api-docs.yml) workflow deploys to the `gh-pages` branch.

The automatic flow is as follows:

* Push to `main` (or manual dispatch) → builds both packages as `dev`.
* Push of a per-packagerelease tag → builds that one version **and** rebuilds the root
  landing page.


### Adding a new package

To document a new package with URL slug `<pkg>` (e.g. `foo`), wire the slug into
each list below. It must follow the directory convention
`packages/toolbox-<pkg>/src/toolbox_<pkg>` and have a `tsconfig.esm.json` plus a
`package.json` whose `exports` point at `./build/esm/<name>.js`.

1.  [**`scripts/generate-api-docs.sh`**](scripts/generate-api-docs.sh) — add the
    slug and title to `TITLES`, e.g. `[foo]=Foo`. `PKG_DIR`, `SRC_DIR`, `TSCONFIG`,
    and the module list derive from the slug.
2.  [**`api-docs.yml`**](.github/workflows/api-docs.yml) (deploy) — in the
    *Resolve* step's `case`, add a `refs/tags/foo-v*) … packages=foo …` arm and
    append `foo` to the `dev` default (`*) … packages=core adk foo …`).
3.  [**`api-docs-backfill.yml`**](.github/workflows/api-docs-backfill.yml)
    (backfill) — add `foo` to the `package` input `options:`. The run checks out
    the release tag and builds the whole workspace, so no per-package arm or
    dependency-build step is needed.
4.  [**`docs-site/hugo.toml`**](docs-site/hugo.toml) — add a
    `[[params.versions.foo]]` block (at least `dev`); see
    [Adding a version to the picker](#adding-a-version-to-the-picker).

### Adding a version to the picker

The version dropdown and the `/<package>/latest/` redirect are driven entirely by
the hand-edited `[params.versions.<pkg>]` list in `docs-site/hugo.toml`, not by
the build's version. Before each **new release**, add a `[[params.versions.<pkg>]]`
block for the version (newest first; the first non-`dev` entry becomes `latest`).

### Backfilling old docs

Use the [`api-docs-backfill.yml`](.github/workflows/api-docs-backfill.yml) workflow to publish
docs for a version whose pages are missing — typically a tag whose on-push deploy
failed or never ran. It builds **one version per run**.


Steps to backfill:

1.  Trigger the workflow from the Actions tab, or with:

    ```bash
    gh workflow run api-docs-backfill.yml -f package=core -f version=v1.0.0
    ```

    To catch up several versions, dispatch it once per `package`/`version`.
2.  Review the resulting generated PR ([Example](https://github.com/googleapis/mcp-toolbox-sdk-js/pull/407)). **Merge it into `gh-pages`** to publish the pages. 
3.  **Add the version to the picker** if it isn't already listed. Add a
    `[[params.versions.<pkg>]]` block on `main` (see
    [Adding a version to the picker](#adding-a-version-to-the-picker)). ([Example PR](https://github.com/googleapis/mcp-toolbox-sdk-js/pull/408))

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

The version dropdown fetches package versions at runtime, so links to versions not present in this branch (other backfills) will 404 locally. That's expected behaviour. 

When done, clean up:

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
