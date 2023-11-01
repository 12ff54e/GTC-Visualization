importScripts('javascripts/gtc-output-parser.min.js'); // expose GTCOutput

const cacheName = '|@_@|/'; // name to be replaced by hash
const staticFiles = [];
const outputs = {};
const folderLimit = 20;

addEventListener('install', event => {
    skipWaiting();
    event.waitUntil(updateCache());

    console.log(
        'A new version of service worker is installed and will soon be activated.'
    );
});

addEventListener('activate', event => {
    // The deletion of old caches must be done before worker can handle any fetch
    // in case obsolete caches being provided for response
    event.waitUntil(clearCache());
});

addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const local_patten = /^\/local\//;
    if (local_patten.test(url.pathname)) {
        if (url.pathname === '/local/plot') {
            // The webpage is generated by server
            return;
        }
        const id = url.searchParams.get('dir');
        event.respondWith(processLocalRequest(event, outputs[id]));
    } else if (staticFiles.length > 0) {
        event.respondWith(cacheFirst(event));
    }
});

addEventListener(
    'message',
    wrap(async event => {
        const { opening, files, id } = event.data;
        if (!opening) {
            delete outputs[id];
            console.log('Closing folder...');
            return;
        }

        const outputFiles = files.filter(file =>
            inTopLevelFolder(file.webkitRelativePath)
        );

        const currentOutput = new GTCOutput(
            outputFiles[0].webkitRelativePath.split('/')[0],
            outputFiles
        );
        const hash = arrayBufferToHex(
            (
                await crypto.subtle.digest(
                    'SHA-1',
                    new TextEncoder().encode(
                        currentOutput.dir + performance.now()
                    )
                )
            ).slice(0, 6)
        );
        outputs[hash] = currentOutput;
        deleteOldestEntry();

        event.source.postMessage({
            done: true,
            snapshotFiles: await currentOutput.getSnapshotFileList(),
            dir: currentOutput.dir,
            outputTag: hash,
        });
    })
);

async function updateCache() {
    return (await caches.open(cacheName)).addAll(staticFiles);
}

async function clearCache() {
    await Promise.all(
        (
            await caches.keys()
        ).map(async key => {
            if (!key.startsWith('GTC-Visualization') && key !== cacheName) {
                await caches.delete(key);
            }
        })
    );
    console.log('Obsolete cache cleared.');
}

/**
 *
 * @param {Event} event
 */
async function processLocalRequest(event, currentOutput) {
    const pathname = new URL(event.request.url).pathname.slice(7); // truncate the leading /local/
    let match;
    if ((match = pathname.match(/^plot\/plotType\/(?<type>[\w\.]+)/))) {
        return Response.json(await currentOutput.getData(match.groups.type));
    } else if (
        (match = pathname.match(/^plot\/data\/(?<type>\w+)-(?<id>[\w_-]+)/))
    ) {
        const { type, id } = match.groups;
        try {
            return Response.json(await currentOutput.getData(type, id));
        } catch (e) {
            console.error(e);
            return new Response('Not found!', { status: 404 });
        }
    } else if (pathname.match(/^plot\/data\/basicParameters/)) {
        return Response.json(await currentOutput.getParameters());
    } else if (pathname.match(/^plot\/Summary/)) {
        return Response.json(
            (await currentOutput.readData('Equilibrium')).radialData
        );
    }
}

async function cacheFirst(event) {
    const cache = await caches.open(currentCacheName);
    let response = await cache.match(event.request);
    if (!response) {
        response = await fetch(event.request);
    }
    return response;
}

function inTopLevelFolder(pathname) {
    return !pathname.match(/[^\/]+\/[^\/]+\//);
}

function wrap(func) {
    return (...args) =>
        func(...args).catch(err => {
            console.error(err);
        });
}

function arrayBufferToHex(arrayBuffer) {
    return [...new Uint8Array(arrayBuffer)]
        .map(x => x.toString(16).toUpperCase().padStart(2, 0))
        .join('');
}

function deleteOldestEntry() {
    const keys = Object.keys(outputs);
    delete outputs[keys[keys.length - folderLimit - 1]];
    return keys.length > folderLimit;
}