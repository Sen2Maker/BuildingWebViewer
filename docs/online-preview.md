# Online preview and share links (web only)

Open the home page, choose **Online mode → Online data preview and sharing**, then:

1. Read the public HTTPS/CORS guidance and expandable endpoint template. Choose **Paired view · Point cloud + mesh** or a toolbox tool (**Mesh viewer**, **Wireframe viewer**, **Point-cloud viewer**). For an individual tool, choose a direct file URL or JSON index separately. The index is filtered to the selected tool; an empty ID picks its first matching entry, and a mismatched ID is reported before navigation. Gaussian splats, point-cloud editing and CAD are listed as local-only until their online adapters exist. Supply the URL and optional initial ID / selected building IDs.
2. Choose **Open data · verify first**. The browser fetches and parses the initial resource. A paired index checks both mesh and points; BWVPC checks its manifest and root chunk, with later detail loaded by the viewer. Errors stay in the dialog with retry guidance; cancellation or edited input invalidates pending checks. Passing this check does not verify every building in a catalog.
3. The existing viewer opens and shows **Configure & share**. The grouped editor covers layout/layers, mesh appearance and scale, point style/size/opacity/solid color, outlines, labels, grid, and palette reversal with automatic or fixed scalar bounds. Its field section shows actual attribute names and three sample values. Assign RGB or HSV channels and their numeric range, then apply the mapping. Data with only XYZ explicitly has no color channels; RGB is disabled in this editor instead of suggesting nonexistent colors. Close the popup to rotate/zoom or use the normal display and camera panels.
4. Choose **Generate share link** to capture the current dataset, selected scope, supported display options and primary camera. The recipient opens the original viewer directly; the configuration popup does not interrupt recipients.

No data is uploaded by this workflow. The preflight and viewer each read the initial resource; there is no cross-page raw-data cache. A localhost viewer link is for local testing; externally shareable links must be generated on the deployed website.

The homepage example uses 100 visually reviewed buildings selected for clean roof outlines and varied forms. It goes through exactly this workflow with a prefilled URL and selection, not a separate example page. This is an aesthetic demo, not a representative accuracy benchmark. Full report links remain available independently and are not the homepage default. The selected ID list limits navigation, not access permission to the public source catalog.

## Ready-to-use building comparison

The homepage has Local / Online modes. The online entry opens the existing Mesh viewer (`lod.html`) with its existing two-viewport layout: point cloud on the left and mesh on the right (stacked vertically on narrow screens). The viewer keeps its familiar toolbar, display controls and camera synchronization; its mode indicator changes from Local mode to Online mode when a comparison link is active. Local and online views share the Previous/Next arrows centered in the preview heading, with the current position / total between them and the display-mode selector on the right. Online comparison uses single-ID navigation. Local single-ID positions follow the filtered natural order; local group navigation shows a contiguous range or the selected count for scattered selections. There is no separate bottom navigation bar.

A compact link such as `lod.html?dataset=bwv-test4000&building=1` carries the building selection; navigation keeps the address tied to the displayed building. Configure & share generates a link for the current selection and view. `quality=original` explicitly selects the original XYZ source; the normal entry uses progressive BWVPC data. Ordinary `lod.html` continues to open the local viewer. Old `compare.html` links are compatibility entries that replace themselves with the same-directory `lod.html` address, preserving the query, fragment and language.

For BWVPC, the root is visible first and verified nodes are appended one at a time. This reduces the first download and lets the user stop at useful detail. See [BWVPC v1](BWVPC.md) for the additive octree contract, point budgets, binary layout and current limits. The older XYZ transport chunks described later still assemble the entire file; they are a different mechanism.

## Direct point-cloud / mesh comparison

Use **Online data preview and sharing**, choose a paired index, supply the public index URL and initial building ID, and verify it. In the viewer, configure the presentation and generate a `lod.html#compare=...&view=...` link. Opening it starts that building directly in the existing Mesh viewer: point cloud on the left, mesh on the right. It does not require the recipient to browse a catalog first. The existing viewport, layer and camera controls remain available; building navigation belongs to this same page. This is an online data source for the existing viewer, not a second comparison interface.

The index is loaded first. The current mesh is fetched, integrity-checked and displayed before waiting for its point cloud. Point parsing uses a module worker when available and deterministic display sampling (250,000 points by default, bounded to at most 1,000,000). Sampling never rewrites the original object and does not reduce network bytes. A short point-count label identifies sampling. Both panes use the same mesh-derived origin and real scale; camera synchronization preserves alignment and does not refit when the delayed point cloud arrives.

Only immediate neighboring building IDs are eligible for speculative caching. Raw-byte cache is limited to 32 MiB and at most three pairs; background requests are bounded and current selection takes priority. Files larger than the cache budget can still load in the foreground up to existing resource caps, without being retained for prefetch. Changing IDs or leaving the page cancels obsolete work. Saving local preferences, downloading the whole directory and native App remote loading are not enabled by this feature.

## What v1 supports

- Point cloud: XYZ, TXT, CSV, PTS, PLY, PCD. The existing parser determines the supported variants and columns.
- Mesh: triangular OBJ; existing mesh parser does not triangulate arbitrary polygons.
- Wireframe: OBJ polylines or face-boundary edges.
- No Gaussian or generator deep-link import in v1; no App/offline remote loading.
- A directory is loaded as metadata only. Search is local and shows 40 rows per page. Selecting a row downloads that resource only. A selected file is downloaded in full before the existing parser sees it; this is **not** tiled geometry streaming or partial-model loading.
- Directory download cap: 5 MiB. Point-cloud download cap: 64 MiB; OBJ cap: 8 MiB. Shared point-cloud preview initially samples at most 1,000,000 points using the existing parser; the visible point limit control can be changed explicitly. Parsed geometry can require much more RAM than its source file, especially on phones. Text parsing/geometry validation retains the existing parser limits and semantics.

## Versioned JSON directory

Use an HTTPS CORS-enabled address for the directory:

```json
{
  "schemaVersion": 1,
  "datasets": [
    {"id":"demo-cloud","name":"Demo points","viewer":"pointcloud","format":"xyz","url":"https://data.example/points.xyz","preset":{"pointSize":2,"grid":true}},
    {"id":"demo-mesh","name":"Demo mesh","viewer":"lod","format":"obj","url":"https://data.example/model.obj","preset":{"grid":true}}
  ]
}
```

URLs above are illustrative, not hosted demo data. Each dataset has a unique id. Optional bytes and lowercase SHA-256 metadata are verified before passing the file to the parser. No linked materials/textures or other manifest resources are auto-fetched. Maximum 10,000 resources.

The existing Drive directory shape `schema_version: 1` / `buildings` is also accepted. Each building has `id`, with optional `point_cloud` and `mesh` records containing `path`, `bytes`, `sha256`, `file_id`, `drive_url`. The adapter produces independent point-cloud and mesh selections; it does not download the entire building collection. A directory must have accessible metadata, and each selected resource must independently be accessible.

## Share URL and temporary settings

The URL fragment contains a JSON descriptor under `preview`. Direct-file descriptors use `schemaVersion`, `url`, `viewer`, `format`, optional `name`, `preset`, `bytes`, `sha256`. Directory links use `schemaVersion`, `manifest`, optional `entry`, `viewer`, `preset`. Prefer the guided workflow rather than manually escaping JSON. Paired descriptors use `compare`, with optional ordered `buildingIds` (up to 5,000; no duplicates; initial ID must be included). The `view` fragment is version 1 and contains validated `controls` plus a primary `camera` snapshot. It restores supported layout/layer/color/grid/point settings and the primary camera after initial loading. The optional `pointSettings` stores the existing column order/tags/custom labels, RGB scale (auto/1/255/65535), HSV scale (degrees/unit/opencv) and color space; it is validated against the loaded schema before use. `palette` stores the actual palette, reversal and manual range. Mapping uses the existing semantic point-cloud logic; invalid/missing fields and incomplete channels report errors. Unapplied mapping drafts and invalid numeric ranges block link generation. Independent unsynchronized pane cameras, processing results, local overlays and arbitrary renderer state are not serialized. BWVPC v1 carries XYZ only, so it cannot provide true RGB colors.

Presets are strict visual options, not executable code. Common options are `grid` (boolean), `palette` (`current`, `viridis`, `inferno`, `grayscale`, `blue-white-red`), `reverse` (boolean). Point-cloud/wireframe options add `pointSize` (1–32, step 0.5), `pointOpacity` (0.1–1, step 0.05), `pointColor` (six-digit hex), `colorMode` (`solid` or `height`). Wireframe additionally supports `wireColor`. LOD supports only the common options. Unknown keys or invalid types fail clearly. An unselected directory preset uses common options only; per-entry presets may use viewer-specific options.

Shared-preview preference writes, including palette, camera bookmarks, navigation, sidebar and animation preferences, use an in-memory profile for that document. They do not read or overwrite the visitor's saved local preferences. Isolation stays latched if the fragment is removed. Closing/reloading loses edits unless they are explicitly exported through the existing file export actions. There is no automatic “save this shared profile as my defaults” action. Ordinary pages retain their normal preference behavior.

Retry or Cancel invalidates older downloads and parsing generations. A newer trusted interaction outside the preview status panel cancels pending remote work rather than allowing a late result to replace the user's newer selection. Share links strip inherited local project/generated query parameters.

## Hosting, privacy and CORS

The browser fetches with omitted credentials, no referrer, CORS mode, no-store and rejected redirects. Google Drive `/file/d/.../view` links are recognized as a separate provider, but its anonymous reader is not configured in this release; the UI reports this before attempting a request. This does **not** make private content readable or guarantee CORS. An approved deployment-specific adapter can be added later; keys must never come from a share link or local preference. Drive may redirect, require login or a download-confirmation page. In those cases use an approved public HTTPS raw-data host with CORS or an intentionally configured same-origin data service; this release adds no proxy, login flow, credential or backend. It does not change Drive sharing permissions.

Only absolute HTTPS URLs are accepted. Embedded credentials, fragments, common secret query parameters and obvious local/private literal addresses are rejected. Hostname checks are lexical, not DNS or network-security enforcement. HTTPS hosts that resolve privately remain subject to browser protections and CORS. Use only trusted data sources. The URL may expose dataset addresses, names and presets to anyone receiving it; do not embed access tokens, signed URLs, private filenames or confidential datasets in a public example.

No private Drive data or credentials are included in shipped source or test fixtures. The user-authorized public example includes its public endpoint and 100 selected IDs; geometry remains on the public data host. Testing uses synthetic resources. Browser visual/device validation remains a separate check from parser, state and network unit tests.

## Retry, cancellation and deadlines

The resource directory can be retried in place after HTTP/network/JSON errors. Cancel or closing the directory aborts its current download; re-opening and choosing **Reload index** starts a fresh request. Only the newest attempt may update the directory. Search, data-type filters and pagination use the already downloaded metadata without further requests. An empty result explains how to adjust filters.

Metadata downloads have a 30-second total deadline. Dataset downloads have a 60-second total deadline, including a stalled body after headers arrive. Timeout and user cancellation are reported separately. Changing the share fragment immediately aborts the old download before page navigation. Neither deadlines nor retry alter local settings or data access permissions.

## Local synthetic resource center (development only)

This repository includes a tiny in-memory resource server with synthetic XYZ, triangular OBJ and directory JSON. No private dataset, Drive ID, credential, large binary or external hosting account is required.

Start it from the repository root:

```sh
node scripts/preview-fixtures.mjs
# Optional fixed loopback port:
node scripts/preview-fixtures.mjs --port 8766
```

The server prints its loopback resource address and available fixtures. Stop it with Ctrl+C. It binds only to 127.0.0.1 and does not publish or upload anything. A Vite development page and this server use different origins/ports.

Production URL policy still rejects HTTP/localhost/private targets. Do not paste the loopback address into a production share link. Automated integration tests use a strict test-only transport adapter: the public-looking synthetic logical origin `https://fixtures.example` maps to this local server, with no production routing bypass. Browser evaluation requires a separately approved HTTPS/CORS test host, not a disabled security check.

Run the integration tests and the complete existing checks with the installed dependencies:

```sh
node --test tests/online-preview*.test.mjs
npm test
npm run build
npm run test:artifacts
```

The real HTTP harness checks response bytes, resource request counts, CORS response headers, slow/stalled responses, abort cleanup, redirect rejection, limits, retry and integrity scenarios. Node HTTP/fetch does not enforce browser CORS. DOM-shaped unit fixtures check state transitions but are not rendered browser tests. Actual browser CORS enforcement, visual layout and device interaction must remain NOT_RUN until a supported browser test is performed. Passing these tests must not be reported as a working anonymous Drive deployment.

## XYZ transport chunks for file-size-limited hosting

A v2 directory may contain a chunked XYZ point cloud alongside ordinary v1-style URL entries, such as its OBJ mesh. Only pointcloud/xyz supports chunks. An individual entry must use either `url` or `chunks`, never both. Existing v1 directories and direct-file links retain their contract.

```json
{
  "schemaVersion": 2,
  "datasets": [{
    "id": "synthetic-cloud",
    "name": "Synthetic cloud.xyz",
    "viewer": "pointcloud",
    "format": "xyz",
    "bytes": 24,
    "sha256": "REPLACE_WITH_ORIGINAL_FILE_SHA256",
    "chunks": [
      {"url":"https://data.example/cloud/part-0001.xyz","bytes":12,"sha256":"REPLACE_WITH_CHUNK_SHA256"},
      {"url":"https://data.example/cloud/part-0002.xyz","bytes":12,"sha256":"REPLACE_WITH_CHUNK_SHA256"}
    ]
  }]
}
```

This illustrative JSON is not a runnable manifest until the SHA placeholders and URLs are replaced. Prefer the packing utility to avoid manually calculating metadata.

Rules:
- 1–64 ordered chunks; each at most 16 MiB; aggregate original bytes at most 64 MiB. Metadata byte lengths must add up exactly. Duplicate normalized chunk URLs are rejected.
- Every chunk and the original complete file require byte length and SHA-256. The directory is fully validated before any chunk is requested. A known unconfigured provider, including the current Drive adapter, is rejected before downloading earlier chunks.
- Chunks download sequentially only after the dataset is selected. Each checksum is verified before requesting the next chunk. All chunks must contain complete valid UTF-8; non-final chunks end at an LF line boundary. CRLF, BOM, original numerical precision, spacing and order are not rewritten.
- The complete ordered bytes and aggregate checksum are verified before passing one file to the existing XYZ parser. The 60-second dataset deadline applies to the entire sequence, not separately to each chunk. Cancel/retry discards the old sequence and never commits a partial dataset.
- This solves a host's single-file size constraint. It is not progressive rendering, spatial tiling, lower-memory whole-scene parsing or support for unlimited total data. The browser still assembles up to 64 MiB and parsing uses additional memory. The preview retains the one-million-point initial sampling limit.

Pack a local XYZ file without uploading or modifying it:

```sh
node scripts/pack-preview-xyz.mjs --input ./synthetic.xyz --output ./synthetic-packed --base-url https://data.example/synthetic-packed/
```

The output path must be new. The utility validates the existing XYZ format and fatal UTF-8, streams byte-preserving line-aligned chunks, computes hashes, and writes the completed manifest last. It never downloads data, changes hosting permissions or embeds a credential. Review the generated directory before publishing it to an approved public HTTPS host. The actual website and source data can stay on different hosts; the data host must permit CORS.

Use a manifest-entry share link rather than putting a long chunk array into a URL fragment. The local synthetic center includes `/chunk-manifest.json`, tampered-chunk and slow-final-chunk cases. Automated tests also create an approximately 26 MiB synthetic XYZ file, verify byte-for-byte chunk concatenation and integrity, then remove only their own temporary files.

### Sharing a chunked dataset without leaking local settings

In **Online data preview and sharing**, choose the desired tool, then **Dataset index · JSON** under Data connection and paste the public `manifest.json` URL. Specify an entry ID or leave it blank to validate the first entry. Do not use one part file as the complete model. After verification, configure the original viewer and generate its share link. The reference stores the index URL and selected entry; it does not copy chunk arrays or file contents into the URL. Each visit rechecks the index and selected entry. Older directory links still support searchable browsing.

## Offline static-resource readiness check

Before deploying an explicitly selected resource directory, run:

```sh
node scripts/check-preview-resources.mjs --root ./synthetic-packed --manifest manifest.json --base-url https://data.example/synthetic-packed/
```

The base URL is the intended public HTTPS directory, not the website viewer URL. The command does not contact that host, upload files, modify data or set CORS. It maps each manifest URL to an existing file inside the explicit local resource root and checks v1/v2 schema, declared lengths, SHA-256, and ordered chunk integrity. For readiness, even ordinary v1 entries require length and hash metadata; the browser's more permissive optional-metadata input contract is unchanged.

The static hosting profile checks all files, including unreferenced files, against 20,000 files and 25 MiB per file. Oversized XYZ sources must be packed first; exclude the original oversized source from the deployment root. The index itself must remain within the viewer's 5 MiB cap. Keep only intended public resources and approved hosting configuration in the root. Cross-origin/outside-base references, queries, traversal encodings and symlinks are rejected rather than silently resolved or downloaded.

A successful exit means the checked local snapshot satisfies these static limits and integrity rules. It is not proof of browser CORS, public readability, hosting-account configuration, permissions to publish, absence of all secrets, or successful rendering. Review data sensitivity and authorization separately, then verify the deployed HTTPS URLs in a browser. Do not edit the resource directory during the check; rerun after any change. Failure exits nonzero and never publishes a partial result.

The checker is intentionally a dedicated-resource-bundle tool, not a source-repository scanner. Accepted regular files are JSON, supported point/OBJ assets, and `_headers`/`_redirects`; hidden/obvious credential filenames and recognizable credential content markers fail the check. This heuristic cannot detect every secret or confidential dataset. It uses bounded streaming reads (8 GiB combined scan/ordered-integrity work budget), with no full-bundle memory copy. Its no-follow filesystem traversal requires supported directory-descriptor access through `/proc/self/fd` or `/dev/fd`; unsupported platforms fail closed rather than following potentially unsafe paths. Run it in the supported cloud/Linux environment if your local platform lacks these primitives.

## Recommended appearance in shared links

The guided workflow starts with explicit recommended presets: grid off, Viridis, no palette reversal, point size 3, full opacity and height coloring where supported. The viewer fits the loaded geometry initially. Users then adjust the actual viewer controls and camera, and generate a new link from that visible configuration. There is no raw preset-JSON editor in the main flow. Local saved settings are not copied into the shared online profile.

For ordinary public object storage, use the final HTTPS object URL with CORS allowed for the website origin. A normal XYZ object up to the existing 64 MiB viewer cap can be loaded directly; 16 MiB transport chunking is optional, not required by this viewer. Keep storage credentials out of source, links and manifests. The separate 25 MiB offline readiness profile targets file-size-limited static hosting; it is not a Rainyun bucket limit and should not be interpreted as one.

### Public relative building indexes

An existing public resource center may use `schema_version: 1`, a `public_base_url`, `path_base: "directory_containing_index"`, and `buildings`. Each building has an `id` and optional `point_cloud`/`mesh` records containing `path`, `bytes` and `sha256`. These records become point-cloud/mesh directory entries without a Drive file ID. The base must exactly match the directory containing the fetched index, and paths must be plain relative paths inside that directory. Absolute paths, dot traversal, percent-encoded path aliases, query strings, backslashes and mixed Drive source fields are rejected. Unicode/spaces are safely URL-encoded per segment. All integrity metadata is required for this adapter.

The index still loads metadata only. Selecting one entry downloads only its one object, verifies its length/hash, and passes it to the existing parser. Existing Drive indexes remain a separate adapter; accepting this public schema does not enable authenticated Drive access.

## Large directory browsing

The directory builds searchable labels once per successful metadata load. It retains only the latest keyword/type filter result, so moving between 40-row pages does not rescan or rebuild strings for all entries. Case/outer whitespace variations use the same normalized search; a changed keyword or type performs a fresh bounded scan. Reloading the index creates a fresh search cache and cannot reuse rows from the prior directory. Search and pagination never download model assets. Synthetic 8,000-entry regression tests check operation counts and entry ordering rather than timing assumptions.

## Full-catalog report presentation

The report entry is `lod.html?dataset=bwv-test4000&building=194&presentation=report-v1&lang=zh`. It uses the complete public catalog, with no selected-ID restriction, and the same viewer/settings code as custom share links. It opens at building 194, with cloud left / mesh right (top / bottom on phones), size 3 circular height-colored points, full opacity, Viridis with automatic per-building range, solid surface-colored mesh with outlines, real scale, synchronized cameras, and grid/labels off. Each building fits its camera automatically; the preset does not reuse one building's absolute camera bounds. It is a versioned preset; later appearance presets should receive another name to preserve report links.

Pages deployment is manual. It checks out the exact dispatch commit, runs tests/build/artifact and native-identity checks, then publishes only `dist/`. Pushing source alone does not deploy. The published v1.0 App release identity remains verified independently.
