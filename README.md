# GTC-Visualization

This node app provides a simple way to inspect GTC(Gyrokinetic Toroidal Code) output data. Once deployed on the server, you can examine various plot generated from raw output data, without downloading any files.

## Requirement
Node.js, v16.13.1 and v18.17.1 are both guaranteed to work

## Quick start
1. `git clone https://github.com/12ff54e/GTC-Visualization`
2. `cp .env_example .env` and modifies it as you wish.
   - **PORT** is the port to which this app listening. Set a larger number to avoid conflicts.
   - **HOST_DIR** is the folder where this app will search gtc output files in.
   - **LIMIT** is the maximum number of concurrent opening GTC output folders.
3. Set NODE_ENV to production (for example, `EXPORT NODE_ENV=production` in Linux).
4. run
    ```bash
    npm install
    npm test
    ```
**Note**: `npm install` needs access to a npm repository. If your server do not have Internet access, you can run `npm pack` and all necessary files are packed into a compressed file, which you can upload to your server. Then you can unpack files and start the server by
   ```bash
   tar -xf GTC-Visualization.tar.gz
   cd GTC-Visualization
   mv .env_example .env
   # change .env file as you wish
   npm start
   ```
You can also, and I suggest to, use process manager or init system to keep app ALWAYS running.

## What's behind the scene
This app use [express.js](http://www.expressjs.com) as server framework, and plot figures with the help of [Plotly.js](https://plotly.com/javascript/), which relies on [MathJax](https://www.mathjax.org/) to render expressions. Most, if not all figure types are from [Huasheng Xie](http://hsxie.me/)'s Matlab program.
