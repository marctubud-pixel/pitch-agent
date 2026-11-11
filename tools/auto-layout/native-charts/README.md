# Native chart foundation

This standalone backend unit creates literal native charts and independently verifies their finalized OOXML and embedded XLSX against caller-supplied original quantitative evidence. It adds no frontend or existing exporter behavior. The engineering fixture contains invented numbers only.

## Contract

`parseChartEvidence(raw, sourceCatalog)` in `chart-data.mjs` is the shared pure source boundary. It returns a deeply frozen `validated-chart-data-v1` value. Its `catalogDigest` hashes the complete canonical source catalog, preserving all array order and decimal lexemes. Each normalized chart carries its own `dataHash`. `sourcesDigest` binds the exact source text inventory and hashes. Canonical JSON sorts object keys and preserves arrays. Raw objects use exact closed keys.

The raw schema is `chart-data-v1` with an ordered `charts` array. Use `engineeringFixture()` or the exported `source.json` as a complete machine-readable example. Each chart declares stable chart/category/series IDs, explicit category/series counts, a complete rectangular literal matrix, type, direction, title, one unit, number format, period, population and at least one limitation. All labels and declarations are `{text, evidence}` records. Every cell has `decimal`, `lexeme`, `conversion`, and `evidence`. Category and series IDs can share a label while remaining distinct.

Sources are `{sourceId, text, sha256, kind}` records. `sha256` hashes the exact well-formed UTF-8 source text. Kind is `captured-source` or `synthetic-engineering-fixture`. Every evidence record contains `sourceId`, `sourceHash`, `indexing: 'utf16'`, inclusive `start`, exclusive `end`, and exact `text`. The parser checks the source hash, actual excerpt, UTF-16 boundaries and intended literal for every declaration and every cell. It never searches prose for numbers. These source texts must be the caller's frozen originals or approved extraction originals. This foundation does not certify an extraction from an original PDF/image, the truth of a captured source, or owner approval.

Decimals are authoritative plain strings. The native number must serialize back to the same exact decimal value, ignoring trailing fractional zeros only. The source string retains its trailing zeros in the digest and provenance. Values outside the safe magnitude or serialization precision fail. Negative zero, exponent input, nulls, formulas, unknown transformations and missing values fail. Percent normalization requires the explicit bounded `percent-to-ratio-v1` rule, a whole-percent lexeme ending in `%`, a ratio unit and an exact decimal result. `identity` never scales a number. Count units require exact safe integers. Supported formats are `0` for counts, `0`, `0.0`, `0.00`, `0.000` for decimals, and `0%`, `0.0%`, `0.00%` for ratios.

Bounds are 32 charts, 100 categories, 16 series, 16 limitations, 100 sources and one million UTF-16 code units per source. The CLI bounds each input file to 8 MiB. Errors have an addressed `CHART_*` code. Reordering approved arrays creates new source content and changes the digest. The parser does not reinterpret order from prose.

## Native writer

`addNativeChart(slide, validated, chartId, placement, brand)` in `native-chart-writer.mjs` revalidates the original data, adds one Artifact Tool native bar/column or standard line chart and returns an occurrence. Placement contains exactly `slideNumber`, `name`, `left`, `top`, `width`, `height`. Geometry uses CSS pixels. Names start with `chart-`. Brand contains exactly `fontFamily`, `titleSize`, `axisSize`, `legendSize`, `labelSize`. These explicit caller parameters set the chart title, axes, axis title, legend and native data labels.

`chartPackageManifest(validated, occurrences)` binds exact source digests and occurrences. `requiredNativeChartOwnerSlides(occurrences)` supplies the actual slide numbers to the first-party finalizer. The caller must set `materializeLiteralChartWorkbooks: true`. This creates a literal editable snapshot and preserves no original formulas or external workbook lineage. Fixture exports set it explicitly.

The caller owns visible periods, source disclosures, population and operative limitations beside each chart. The isolated fixture retains those in synthetic notes for engineering audit. It is not a proposed customer layout and cannot satisfy manuscript restriction-placement acceptance. Serial integration must add chart obligations and source-visible restrictions to the approved content pipeline.

## Independent package proof

`verifyNativeChartPackage(pptx, raw, sources, manifest)` in `chart-package-client.mjs` reparses the actual original input and invokes `chart-package-verify.py`. The Python inspector reads the final delivery ZIP and actual embedded workbook. It does not use Artifact Tool's cached report as evidence.

The inspector checks actual presentation slide order, named native frames, native identities, geometry, supported chart type, series count/order/name, category order, literal values, signs, zero, number formats, axis visibility, native labels, title, unit and explicit font declarations. It checks internal chart/workbook relationships, actual XLSX cells and headers, formulas/ranges and both caches against the frozen source matrix. It rejects cache-only charts, external relationships, unknown or undeclared chart frames, shared parts, missing workbooks, formulas and hidden workbook rows/columns. It uses the pinned finalizer's paired-column `Chart Data` snapshot mapping, with exact ranges. A changed finalizer mapping must fail until this explicit contract is revised. Legal package-root absolute OPC targets are accepted after resolving to actual package members. No filesystem paths or URLs are accepted as relationship targets.

ZIP files are bounded before reading. Member count, total expansion, per-member size, ratio, duplicate names, paths and XML declarations/node count are checked. Files are read from memory without extracting archive paths. The inspector rejects external relationships everywhere in the outer ZIP and each embedded XLSX.

The package proof binds package hash, source/catalog digests, chart and workbook hashes, and ordered cell mappings. Its `nativeApplicationEditVerified` stays false. Font declarations and Artifact Tool previews do not prove installed native fonts, target application rendering or edit/reopen behavior. Callers must freeze the original source files and manifest independently. Substituting an entire new source and manifest is a new authorized input, not something an artifact-only verifier can authenticate.

## Reproduce

Use the bundled runtime without installing packages. Link a private `node_modules` to the bundled read-only packages. Set `RUNTIME_NODE`, `RUNTIME_NODE_MODULES`, `RUNTIME_PYTHON` and `PYTHONDONTWRITEBYTECODE=1`. The verified bundle is 26.1020.11618. This adapter imports its first-party finalizer helper by the configured absolute installation path, matching the current renderer's runtime arrangement. Serial integration must include all new modules and runtime identities in its closure.

Run these commands from the isolated checkout with the bundled Node/Python executables.

```sh
node --test tools/auto-layout/native-charts/chart-data.test.mjs
node tools/auto-layout/native-charts/chart-cli.mjs fixture /absolute/new/private/output-directory
node tools/auto-layout/native-charts/chart-cli.mjs verify /absolute/output/delivery/synthetic-native-charts.pptx /absolute/output/source.json /absolute/output/original-sources.json /absolute/output/manifest.json
python3 tools/auto-layout/native-charts/chart-package.test.py /absolute/output /absolute/bundled/node
```

Run the presentation skill's artifact operation marker once before a new authoring operation as required by that skill. The fixture command exclusively creates its output directory and refuses an existing directory. Finalization also refuses an existing delivery file. It exports three slides, finalizes one PPTX, verifies the actual workbook package and imports the final PPTX for three PNG renders. Mutation tests create a fresh owned subdirectory and never overwrite earlier cases.

## Integration boundary

No existing writer registry, semantic version, workbench validator, object/font verifier, renderer manifest, provider, database, API or frontend is changed. Serial integration must freeze source approvals, connect charts to new semantic contracts, place source/restriction text in all three existing styles, register this writer, incorporate this proof in native delivery coverage and refresh the renderer closure. Native application edit/save/reopen tests remain required for full editable-PPT delivery. This foundation does not close the complete backend goal.

## Independent review repair, 2026-10-31

The package inspector now treats workbook row and column `hidden` values as XML Schema booleans. It collapses the permitted XML whitespace and recognizes `1`, `true`, `0`, and `false`. It rejects malformed spellings and hidden dimensions. Shared-string indices must use bounded ASCII digits and refer to an existing table entry. Negative, fractional, exponent, empty, whitespace and out-of-range indices fail before indexing.

Each category or value source has exactly one accepted reference variant. A reference has exactly one formula followed by its matching cache. Unknown children, duplicate caches and a simultaneous literal source fail. This preserves the existing source, cache and workbook comparisons.

The supported axis semantics follow the writer's existing output. Each chart has one category axis and one value axis with distinct IDs and reciprocal crossing references. Native chart axis IDs preserve category then value order. Both orientations are `minMax`. A horizontal bar uses left category and bottom value axes. Columns and lines use bottom category and left value axes. Changed crossings, logarithmic scales, category bounds and other axis types fail. Optional value bounds must be finite, unique, strictly ordered when both occur, and contain every intended source point. Bar bounds also contain zero. This is a conservative package contract. It does not prove native application display order. The writer's existing horizontal bar orientations remain unchanged.

Source-bound text rejects XML 1.0 forbidden controls, unpaired surrogates, U+FFFE and U+FFFF. Valid supplementary characters, including emoji, remain intact. XML 1.0 permits supplementary-plane noncharacters such as U+10FFFF, so they remain accepted.

Run the added regressions using the same bundled runtimes and an actual finalized fixture directory. Both commands return nonzero for an unexpected acceptance or rejection.

```bash
PYTHONDONTWRITEBYTECODE=1 "$RUNTIME_PYTHON" tools/auto-layout/native-charts/chart-boundary.test.py "$FIXTURE_DIRECTORY" "$RUNTIME_NODE"
"$RUNTIME_NODE" tools/auto-layout/native-charts/chart-text-boundary.test.mjs
```

The package boundary suite covers the review's hidden row, negative shared-string index, ambiguous numeric reference, clipped value range and reversed category orientation. It adds hidden column booleans, malformed indices, closed nested references, axis linkage and bounds, legal internal root-absolute OPC targets, unused outer and workbook external links, ZIP resource limits and XML node limits. Keep the original 23 parser tests and 35 package mutation tests as separate runs.

The first-party horizontal bar preview still shows categories bottom to top and a reversed legend order. Target PowerPoint edit, resize, save and reopen acceptance remains pending. Neither package validation nor first-party PNG previews closes that gate. This foundation remains unconnected to the complete backend and does not certify the overall PPT delivery goal.
