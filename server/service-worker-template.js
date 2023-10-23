// import GTCOutput from './libs/GTC-output-parser/main.js';

const cacheName = '|@_@|/'; // name to be replaced by hash
const staticFiles = [];

addEventListener('install', event => {
    event.waitUntil(updateCache());
    console.log('Service worker installed.');
});

addEventListener('activate', event => {
    // The deletion of old caches must be done before worker can handle any fetch
    // in case obsolete caches being provided for response
    event.waitUntil(clearCache());
});

addEventListener('fetch', event => {
    const local_patten = /^\/local\//;
    if (local_patten.test(event.pathname)) {
        event.respondWith(processLocalRequest(event));
    } else if (staticFiles.length > 0) {
        event.respondWith(cacheFirst(event));
    }
});

addEventListener('message', event => {
    const files = event.data;

    // Test read file
    console.log('Selected folder contains: ');
    console.group();
    files.forEach(file => {
        console.log(file.webkitRelativePath);
    });
    console.groupEnd();
    const gtcOutReader = files
        .find(file => file.webkitRelativePath.endsWith('gtc.out'))
        .stream.pipeThrough(new TextDecoderStream())
        .getReader();
    gtcOutReader.read().then(({ done, value }) => {
        console.log('First line of gtc.out: ');
        console.group();
        console.log(value.split('\n').at(0));
        console.groupEnd();
    });
});

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
async function processLocalRequest(event) {
    // TODO: implement this function
    const pathname = event.pathname.slice(6); // truncate the leading /local/
    // const gtcOutput = new GTCOutput((await event.request.body.json()).dirname, );
    let match;
    if ((match = pathname.match(/^plot\/plotType\/(?<type>\w+)/))) {
        const type = match.groups.type;
    } else if (
        (match = pathname.match(/^plot\/data\/(?<type>\w+)-(?<id>\w+)/))
    ) {
        const { type, id } = match.groups;
    } else if (pathname.match(/^plot\/data\/basicParameters/)) {
    } else if (pathname.match(/^plot\/Summary/)) {
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
