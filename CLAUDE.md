# AGENTS.md

This file provides repository guidance for any AI coding agent working with this codebase.

## Commands

```bash
# Development (builds Plotly once; nodemon rebuilds the source-mapped client
# before starting and before each restart triggered by client/server/view changes)
npm test

# Production start (runs the webpack-bundled server)
npm start

# Build custom Plotly.js bundle (only needed trace types: contour, heatmap, scatter3d, carpet, contourcarpet, scattercarpet)
npm run pack-custom-plotly

# Validate all client/gtc-input/input-parameters-v*.json files against the server schema
npm run validate-input-parameters

# Bundle all client entry points from client/ into public/javascripts/ (webpack, target: web)
npm run pack-client

# Development client bundles with external source maps
npm run pack-client:dev

# Bundle server into server-prod.js (webpack, target: node)
npm run pack-server

# Full distributable tarball (prepack installs/builds, then pack creates the tar)
npm run pack
```

## Architecture

This is an Express.js app that visualizes GTC (Gyrokinetic Toroidal Code) simulation output. Users browse a server-side file tree of simulation output directories, select one, then view interactive Plotly figures generated from the raw `.out` files.

### Server-side (`server/`)

**`server/server.js`** — Express app entry point. Key responsibilities:
- Scans `HOST_DIR` (from `.env`) every hour for `gtc.out` files using `FileTree`
- Caches parsed `GTCOutput` instances in `output` object; evicts oldest when exceeding `LIMIT`
- Routes: `GET /` (folder browser), `POST /plot` (select folder), `GET /plot/plotType/:type` (read a file), `GET /plot/data/:typeid` (get plot data), `POST /plot/data/download` (download output files)
- Middleware at `/plot` looks up the `GTCOutput` instance by query string `dir` param

**`server/fileTree.js`** — `FileTree` class: recursive tree structure for directory listings. `FileTree.readFileTree(dir)` walks a directory; `filter()` searches for files matching a condition; `toHTML2()` renders the interactive folder browser.

**`server/GTC-output-parser/`** — The data parsing pipeline:

| File | Role |
|---|---|
| `main.js` | `GTCOutput` class: orchestrates reading. `GTCOutput.index` maps type names → `{classConstructor, fileName}`. `readData(type)` dispatches to the correct parser. `getPlotData(type, id)` returns Plotly-compatible JSON. |
| `PlotType.js` | Base class for all plot types. `static readDataFile(filePath, basicParams)` streams a file line-by-line into a generator (`*parseLine()`). Subclasses implement the generator to populate their data structures. Sets `isTimeSeriesData`, `initBlockSize`, `entryPerStep` for completion checking. |
| `PlotlyData.js` | Wrapper for Plotly figure data (`data` array + `layout` object). Provides helpers: `addX()`, `axisEqual()`, `hideCarpetGrid()`. |
| `history.js` | Parses `history.out` — time series of field values/RMS/modes and particle diagnostics (density, momentum, energy, fluxes). |
| `snapshot.js` | Parses `snap*.out` — field data on flux surfaces and poloidal plane, plus particle profiles and PDFs. |
| `equilibrium.js` | Parses `equilibrium.out` — 1D radial profiles and 2D poloidal plane data. |
| `radialTime.js` | Parses `data1d.out` — radial-time heatmaps of particle/energy/momentum fluxes and field zonal/RMS. |
| `tracking.js` | Parses `trackp_dir/TRACKP*` files — particle trajectory tracking. Overrides `readDataFile` to read multiple files in parallel. |
| `read_para.js` | Parses simulation parameters from `gtc.out` (key=value format) using regex. Handles `nmodes`/`mmodes` arrays and `tstep_seconds`. |
| `util.js` | `part()`, `flat()`, `range()`, `add_to_subscript()` helpers. |

**Parser pattern**: All plot type subclasses implement `*parseLine()` as a generator. `PlotType.readDataFile()` creates a readline interface, instantiates the subclass, gets the generator, then feeds each line to `parser.next(line)`. The generator yields to receive the header lines, then loops `while (true)` yielding for each data line. This avoids loading entire files into memory.

### Client-side source (`client/`)

Editable browser code lives under `client/`, outside the static `public/` tree. `npm run pack-client` builds the plot page, folder picker, and input generator into `public/javascripts/`. That output directory is generated and ignored by Git. `Plotly` is loaded as a separate `<script>` tag; FFTE is loaded lazily by `client/shared/fft.js`.

`npm test` uses `pack-client:dev`, which emits readable development bundles and external `.map` files. Production commands use `pack-client`/`pack-all`, which disable source maps.

The input parameter descriptors are imported into the input-generator bundle. The `pack-client`, `pack-server`, and `pack-all` npm commands automatically run `validate-input-parameters` first, so invalid descriptors fail before webpack packages them.

#### `index.js` — Entry point

Bootstrap (~115 lines): imports all modules and wires the `load` event handler. All logic is delegated.

#### `components/` — UI widgets

| File | Role |
|---|---|
| `status-bar.js` | `StatusBar` class (info/warn/err display), `getStatusBar()`, `wrap()`, `addLoadingIndicator()` |
| `navigation.js` | Breadcrumb bar + copy-path: fetches `/fileTree`, constructs dropdowns, manages expand/collapse |
| `download.js` | `setupDownloadForm()` — wires the download form; delegates POST to `api.downloadOutputFiles` |
| `figure-range-controls.js` | Collapsible "Figure Range" panel: per-figure X/Y min/max inputs, two-way sync via `plotly_relayout` |
| `units.js` | Time-unit chooser + conversion: `refreshTimeUnitFactor()`, `applyTimeUnitToFigures()`, `TIME_UNIT_LABEL` |
| `gtc-output-picker.js` | Folder browser dropdown (loaded by `index.pug`, separate from the plot page) |

#### `control/` — App orchestration

| File | Role |
|---|---|
| `state.js` | Centralized state object; also exposed as `window.GTCGlobal` for console inspection |
| `figure-manager.js` | Figure lifecycle: `openPanel()`, `getDataThenPlot()`, `cleanPlot()`, `cleanPanel()` |
| `api.js` | Server communication: `requestPlotData()`, `downloadOutputFiles()` |

#### `plotting/` — Data processing & rendering

| File | Role |
|---|---|
| `plot-data-process.js` | `historyMode`, `trackingPlot`, `addSimulationRegion`, `cal_gamma`, `cal_omega_r`, `cal_spectrum` |
| `snapshot.js` | All snapshot concerns: FFT spectrum, poloidal rendering (Plotly + WebGL), snapshot player |
| `summary-generate.js` | `generateSummary()` + `buildSummaryPage(openPanel)` |
| `history-recal.js` | `addHistoryRecal(panel)` — "Recalculate growth rate and frequency" button |

#### `shared/` — Cross-cutting utilities

| File | Role |
|---|---|
| `util.js` | Pure helpers: `callEventTarget`, `propagateFetchError`, `nodeIs`, `postForm`, `min_max`, `interleave`, `unInterleave` |

#### `gtc-input/` — Input file generator (separate page)

| File | Role |
|---|---|
| `input-generate.js` | GTC input file generator form |
| `input-parameters-v11.json` / `input-parameters-v16.json` | Parameter specs for two GTC versions |

#### Other

- **`plotly-custom.min.js`** — Custom Plotly.js bundle (built from `custom-plotly/`)

### Generated client assets (`public/javascripts/`)

Webpack emits `plot-page.js`, `folder-picker.js`, and `input-generator.js` here. Do not edit these files directly; rebuild them with `npm run pack-client`.
- **`../libs/ffte/`** — FFTE compiled to WASM for client-side FFT; source lives in the `ffte` submodule

### Views (`views/`)

Pug templates: `index.pug` (folder browser with file tree and scan controls) and `plot.pug` (tabbed plot interface with breadcrumb navigation, download controls, and figure containers).

### Custom Plotly build (`custom-plotly/`)

Bundles a minimal Plotly.js with only the trace types used: contour, heatmap, scatter3d, carpet, contourcarpet, scattercarpet. Output goes to `public/libs/plotly/plotly-custom.min.js`.

## Environment

Configuration via `.env` (see `.env_example`):
- `PORT` — server port (default 3000)
- `HOST_DIR` — root directory to scan for GTC output folders
- `LIMIT` — max concurrent cached `GTCOutput` instances
- `SHOW_PATH` — whether to expose full server paths to the client

## Data flow

1. `GET /` → server returns folder browser (`index.pug`) with file tree from cache
2. User selects a GTC output folder → `POST /plot` → server creates/caches a `GTCOutput` instance, returns `plot.pug` with available plot types and snapshot files
3. User clicks a tab (e.g., History) → `GET /plot/plotType/History` → server calls `gtcOutput.readData('History')` which parses `history.out`
4. User selects a sub-plot → `GET /plot/data/History-phi-point` → server calls `gtcOutput.getPlotData('History', 'phi-point')` → returns `PlotlyData` as JSON
5. Client renders the figure with Plotly.js; some data (history mode growth rates, snapshot spectra) is further processed client-side
