# GTC-Visualization

This node app provides a simple way to inspect GTC(Gyrokinetic Toroidal Code) output data. Once deployed on the server, you can examine various plot generated from raw output data, without downloading any files.

## Requirement
- Node.js (>=v12.16.1)
- npm (>=v6.13.4)

## Quick start
1. Clone from repository.
2. `mv .env_sample .env` and modifies it as you wish.
3. Set NODE_ENV to production (for example, `EXPORT NODE_ENV=production` in Linux).
4. run
    ```bash
    npm install --production
    npm start server
    ```
You can also, and I suggest to, use process manager or init system to keep app ALWAYS running.

## What's behind
This app use [express.js](http://www.expressjs.com) as server framework, and plot figures with the help of [Plotly.js](https://plotly.com/javascript/). Most, if not all figure types are from Huasheng Xie's Matlab program.
