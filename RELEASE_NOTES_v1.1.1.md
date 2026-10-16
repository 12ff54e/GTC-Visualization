# GTC Visualization v1.1.1

This patch release fixes overlapping names in the plot-page breadcrumb folder list.

## Changes

- Truncate long folder names with an ellipsis so they do not overlap the `gtc.out` marker.
- Keep the output marker visible and place expanded subfolder lists on their own row.

## Install

Extract `GTC-Visualization.tar.gz`, copy `.env_example` to `.env`, set `HOST_DIR` to the GTC output root, then install dependencies and start the service with `npm install` and `npm start`. Node.js 22 or newer is required.