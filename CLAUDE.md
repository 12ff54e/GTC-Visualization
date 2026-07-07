# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (with auto-restart via nodemon; ignores changes in public/ and custom-plotly/)
npm test

# Production start (runs the webpack-bundled server)
npm start

# Build custom Plotly.js bundle (only needed trace types: contour, heatmap, scatter3d, carpet, contourcarpet, scattercarpet)
npm run pack-custom-plotly

# Bundle server into server-prod.js (webpack, target: node)
npm run pack-server

# Full distributable tarball (npm install + both webpack builds + tar)
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

### Client-side (`public/`)

- **`javascripts/index.js`** — Bootstrap entry point (~115 lines): imports all modules and wires the `load` event handler (tab switches, snapshot buttons, unit chooser, download form, breadcrumbs). All logic is delegated to imported modules.
- **`javascripts/figure-manager.js`** — Figure lifecycle core: `openPanel()` opens a tab panel and creates sub-plot buttons; `getDataThenPlot()` fetches data, pre-processes it, renders Plotly figures; `cleanPlot()` / `cleanPanel()` reset the figure wrapper and panel visibility. Orchestrates all plot-type-specific behaviour.
- **`javascripts/status-bar.js`** — Application shell: `StatusBar` class (info/warn/err display), `getStatusBar()`, `wrap()` (async error handling), and `addLoadingIndicator()` (loading spinner wrapper). Used by virtually every other module; depends only on well-known DOM elements.
- **`javascripts/navigation.js`** — Breadcrumb bar and copy-path button setup: fetches the server-side file tree on load, constructs dropdown folder lists for each breadcrumb segment, manages expand/collapse and click-outside-to-close behaviour. Called once from the `load` handler.
- **`javascripts/download.js`** — GTC output file download form: `setupDownloadForm()` wires the expand/collapse file-list button and the "Download all/selected" submit buttons. Delegates the POST request to `api.downloadOutputFiles`.
- **`javascripts/history-recal.js`** — History-mode recalculate button: `addHistoryRecal(panel)` appends a "Recalculate growth rate and frequency" button that re-fits using the user's zoom range and re-renders the affected figures.
- **`javascripts/snapshot.js`** — All snapshot concerns: `snapshotPreprocess()` dispatches to spectrum/poloidal pipelines; `addSnapshotPlayer()` drives frame-by-frame animation; `snapshotPoloidal()` / `snapshotPoloidalPreview()` / `snapshotSpectrum()` handle data processing and rendering (Plotly carpets + WebGL preview with FFTW-based spectrum analysis).
- **`javascripts/state.js`** — Centralized application state object (replaces ad-hoc `window.GTCGlobal` properties). Documented with owning concern per property block (units, figure lifecycle, history mode, parameters, FFT). Also exposed as `window.GTCGlobal` for backward compatibility with modules not yet migrated to ES imports.
- **`javascripts/util.js`** — Shared pure-utility functions with no app-state or DOM dependencies: `callEventTarget`, `propagateFetchError`, `nodeIs`, `postForm`, `min_max`, `interleave`, `unInterleave`.
- **`javascripts/api.js`** — Server communication layer: `requestPlotData()` fetches plot data/metadata from the Express backend; `downloadOutputFiles()` POSTs a download request and returns the blob + filename. All fetch URL construction and error propagation lives here.
- **`javascripts/units.js`** — Time-unit conversion: `getBasicParameters()` fetches/caches simulation params; `refreshTimeUnitFactor()` recomputes conversion factors from base unit R₀/c_s to R₀/v_A, tstep, and μs; `applyTimeUnitToFigures()` rescales History/RadialTime x-axis values. Exports `TIME_UNIT_LABEL` for Plotly axis titles.
- **`javascripts/figure-range-controls.js`** — Per-panel collapsible "Figure Range" controls: `ensurePlotRangeControls()` creates the container, `renderPlotRangeControls()` builds per-figure X/Y min/max input forms, `refreshPlotRangeControls()` syncs inputs from live Plotly axis ranges. Two-way sync via `plotly_relayout` events; also feeds history-mode zoom ranges into `state.hist_mode_range`.
- **`javascripts/plot-data-process.js`** — Client-side computation: growth rate fitting for history mode data (`historyMode`, `cal_gamma`, `cal_omega_r`, `cal_spectrum`), particle tracking (`trackingPlot`), equilibrium simulation region overlay (`addSimulationRegion`). Imports array utilities from `util.js`.
- **`javascripts/summary-generate.js`** — Summary page: `generateSummary(data)` renders the equilibrium summary; `buildSummaryPage(openPanel)` orchestrates data fetching + rendering and registers jump-to-plot buttons.
- **`javascripts/drop-down.js`** — Folder browser dropdown interaction (loaded by `index.pug`, separate from the plot page)
- **`javascripts/plotly-custom.min.js`** — Custom Plotly.js bundle (built from `custom-plotly/`)
- **`javascripts/input-generate.js`** — GTC input file generator form
- **`javascripts/input-parameters-v11.json` / `input-parameters-v16.json`** — Input parameter specifications for two GTC versions
- **`libs/fftw-js/`** — FFTW compiled to WASM for client-side FFT

### Views (`views/`)

Pug templates: `index.pug` (folder browser with file tree and scan controls) and `plot.pug` (tabbed plot interface with breadcrumb navigation, download controls, and figure containers).

### Custom Plotly build (`custom-plotly/`)

Bundles a minimal Plotly.js with only the trace types used: contour, heatmap, scatter3d, carpet, contourcarpet, scattercarpet. Output goes to `public/javascripts/plotly-custom.min.js`.

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
