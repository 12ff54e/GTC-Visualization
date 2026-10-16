# GTC Visualization v1.1.0

This release improves the output-folder selection page and includes a Chinese program guide.

## Changes

- Search GTC output folders by name or path, with results ordered by most recent update.
- Show the selected folder, scan status, output-folder count, and the age of the last disk scan.
- Improve the folder page layout on narrow screens and add visible keyboard focus for folder choices.
- Keep the selected output folder when search results change.
- Fix release packaging so `npm run pack` packages files from the current checkout, regardless of its directory name.

## Install

Extract `GTC-Visualization.tar.gz`, copy `.env_example` to `.env`, set `HOST_DIR` to the GTC output root, then install dependencies and start the service with `npm install` and `npm start`. Node.js 22 or newer is required.
