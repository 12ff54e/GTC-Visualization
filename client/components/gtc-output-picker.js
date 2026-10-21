let outputFolders = [];
let selectedOutputPath;
const SEARCH_RESULT_LIMIT = 100;

window.addEventListener(
    'load',
    wrap(
        addLoadingIndicator(async () => {
            setup_folder_search();
            setup_folder_selection();
            setup_server_comm_btns();

            for (let btn of document.querySelector('.ctrl').children) {
                btn.addEventListener('click', event => {
                    event.preventDefault();
                    if (event.target.innerText.includes('Collapse')) {
                        for (const btn of document.querySelectorAll(
                            '.collapsible'
                        )) {
                            if (
                                btn.parentElement.parentElement.parentElement
                                    .parentElement.id === 'recent_ul'
                            ) {
                                continue;
                            }
                            if (btn.innerText == '-') {
                                btn.click();
                            }
                        }
                    } else {
                        const expandEntry = li => {
                            const btn = li.querySelector('.collapsible');
                            if (btn) {
                                if (btn.innerText == '+') {
                                    toggleList(btn);
                                }
                                for (const item of getButtonContent(btn)
                                    .children) {
                                    expandEntry(item);
                                }
                            }
                        };
                        expandEntry(
                            document.querySelector('#outer_ul')
                                .firstElementChild
                        );
                    }
                });
            }

            document
                .querySelector('#folder_form')
                .addEventListener('formdata', ev => {
                    const data = ev.formData;
                    if (selectedOutputPath) {
                        data.set('gtc_output', selectedOutputPath);
                    } else if (
                        !data.has('gtc_output') &&
                        outputFolders.length > 0
                    ) {
                        data.set('gtc_output', outputFolders[0].path);
                    }
                });

            await fetch_and_populate_folder('/fileTree');
        })
    )
);

// recursively set height of all ancestor elements, ends at outermost ul
function setHeight(elem, hight) {
    if (elem.localName === 'ul') {
        const prev_height = elem.style.height.split(/[a-zA-Z]/, 1)[0];
        elem.style.height = `${
            hight + (prev_height ? parseFloat(prev_height) : 0)
        }px`;
        setHeight(elem.parentElement, hight);
    } else if (elem.localName === 'li') {
        setHeight(elem.parentElement, hight);
    }
}

function getButtonContent(btn, tag_suffix = '', max_depth = -1) {
    const dirEntry = btn.parentElement.parentElement;
    if (!dirEntry.nextElementSibling?.classList.contains('content')) {
        dirEntry.after(generateContent(dirEntry, tag_suffix, max_depth));
    }
    return dirEntry.nextElementSibling;
}

function toggleList(btn, tag_suffix = '', max_depth = -1) {
    const contentUL = getButtonContent(btn, tag_suffix, max_depth);
    contentUL.classList.toggle('active_list');
    if (contentUL.classList.contains('active_list')) {
        setHeight(contentUL, contentUL.scrollHeight);
        btn.innerText = '-';
    } else {
        setHeight(contentUL, -contentUL.scrollHeight);
        btn.innerText = '+';
    }
}

function generateContent(dirEntry, tag_suffix, max_depth) {
    const fileTree = dirEntry.dirObj;
    const ul = document.createElement('ul');
    ul.classList.add('content');
    for (const entry of fileTree.content) {
        if (typeof entry === 'string') {
            continue;
        }
        ul.append(
            generateListEntry(
                entry,
                tag_suffix,
                max_depth > 0 ? max_depth - 1 : max_depth
            )
        );
    }

    return ul;
}

function generateListEntry(entry, tag_suffix = '', max_depth = -1) {
    const li = document.createElement('li');
    const entryContainer = document.createElement('div');
    entryContainer.dirObj = entry;
    li.append(entryContainer);

    if (entry.mTimeMs) {
        // This entry is a gtc output folder
        const path = entry.path;
        const input = document.createElement('input');
        input.setAttribute('id', `${path}${tag_suffix}`);
        input.setAttribute('value', path);
        input.setAttribute('type', 'radio');
        input.setAttribute('name', 'gtc_output');
        input.checked = path === selectedOutputPath;
        const label = document.createElement('label');
        label.setAttribute('for', `${path}${tag_suffix}`);
        label.innerText = entry.dirname;
        if (tag_suffix.length > 0) {
            label.innerText = path;
            label.title = path;
        }
        const modTime = document.createElement('div');
        modTime.classList.add('mod');
        modTime.innerHTML = `<div style="display:none">${localeISOLikeForm(
            entry.mTimeMs
        )}</div><div>${timeText(entry.mTimeMs)}</div>`;

        modTime.addEventListener('click', function (event) {
            for (let sub of this.children) {
                if (sub.style.display == 'none') {
                    sub.style.display = 'block';
                } else {
                    sub.style.display = 'none';
                }
            }
        });
        entryContainer.append(document.createElement('div'), modTime);
        entryContainer.firstElementChild.append(input, label);
    } else {
        entryContainer.append(document.createElement('div'));
        entryContainer.firstElementChild.innerText = entry.dirname;
    }

    if ((entry.count.files === 1 && entry.mTimeMs) || max_depth === 0) {
        // This folder has no sub-folders, or max depth has reached
        li.classList.add('tip');
    } else {
        const listButton = document.createElement('button');
        listButton.classList.add('collapsible');
        listButton.innerText = '+';
        listButton.addEventListener('click', event => {
            event.preventDefault();
            toggleList(event.target, tag_suffix, max_depth);
        });
        entryContainer.firstElementChild.prepend(listButton);
    }

    return li;
}

// wrap async function for error handling
function wrap(func) {
    return (...args) =>
        func(...args).catch(err => {
            console.log(err);
        });
}

function localeISOLikeForm(time) {
    const date = new Date(time);
    // manually shift time by time zone
    const shifted = new Date(date - date.getTimezoneOffset() * 60000);

    return shifted.toISOString().split(/[TZ]/, 2).join(' ');
}

function timeText(time) {
    const before = new Date(time);
    const now = new Date();

    const timeDiff = (now.getTime() - before.getTime()) / 1000;
    let text;
    if (timeDiff < 60) {
        text = 'Just now';
    } else if (timeDiff < 600) {
        text = 'Minutes ago';
    } else if (timeDiff < 3600) {
        text = 'Within last hour';
    } else if (timeDiff < 14400) {
        const num = ['One', 'Two', 'Three'];
        text = `${num[Math.floor(timeDiff / 3600) - 1]} hour${
            timeDiff < 7200 ? '' : 's'
        } ago`;
    } else if (now.toDateString() === before.toDateString()) {
        text = before.toTimeString().substring(0, 5);
    } else if (now.getFullYear() === before.getFullYear()) {
        text = before.toDateString().slice(0, -5);
    } else {
        text = before.toDateString();
    }

    return text;
}

function addLoadingIndicator(func) {
    return async (...args) => {
        const loading = document.querySelector('#loading');
        loading.style.visibility = 'visible';
        try {
            await func(...args);
        } finally {
            loading.style.visibility = 'hidden';
        }
    };
}

/**
 * Get all GTC output folders and attach their paths.
 * @param file_tree
 * @returns
 */
function getOutputFolders(file_tree) {
    const output_folders = [];
    // The root itself can be a GTC output folder; the DFS below visits only
    // child entries, so add it before traversing those children.
    if (file_tree.mTimeMs) {
        file_tree.path = `/${file_tree.dirname}`;
        output_folders.push(file_tree);
    }
    // DFS
    const folder_stack = [[file_tree, 0]];
    while (folder_stack.length > 0) {
        const [current_folder, idx] = folder_stack.at(-1);
        let i = idx;
        for (; i < current_folder.content.length; ++i) {
            const entry = current_folder.content[i];
            if (typeof entry === 'string') {
                continue;
            }
            if (entry.mTimeMs) {
                entry.path =
                    '/' +
                    folder_stack
                        .map(p => p[0].dirname)
                        .join('/')
                        .concat(`/${entry.dirname}`);
                output_folders.push(entry);
            }
            if (entry.count.folders > 1) {
                folder_stack.at(-1)[1] = i + 1;
                folder_stack.push([entry, 0]);
                break;
            }
        }
        if (i == current_folder.content.length) {
            folder_stack.pop();
        }
    }

    return output_folders.sort((a, b) => b.mTimeMs - a.mTimeMs);
}

function populate_recent(file_tree) {
    outputFolders = getOutputFolders(file_tree);
    if (
        selectedOutputPath &&
        !outputFolders.some(entry => entry.path === selectedOutputPath)
    ) {
        selectedOutputPath = undefined;
    }
    const recent_entries = outputFolders.slice(0, 3);
    const recent_entry_virtual_folder = {
        dirname: 'Recent Tasks',
        content: recent_entries,
        count: { files: recent_entries.length },
    };
    const recent_ul = document.querySelector('#recent_ul');
    recent_ul.replaceChildren(
        generateListEntry(recent_entry_virtual_folder, '#recent', 1)
    );
    recent_ul.classList.add('active_list');
    recent_ul.style.height = `${recent_ul.scrollHeight}px`;
    render_folder_search_results();
    update_folder_selection_status();
}

function setup_folder_search() {
    const input = document.querySelector('#folder-search');
    let timer;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(render_folder_search_results, 120);
    });
}

function render_folder_search_results() {
    const input = document.querySelector('#folder-search');
    const results = document.querySelector('#folder-search-results');
    const status = document.querySelector('#folder-search-status');
    const query = input.value.trim().toLocaleLowerCase();
    results.replaceChildren();

    if (!query) {
        results.hidden = true;
        status.textContent = `${outputFolders.length.toLocaleString()} GTC output folders available. Search by folder name or path.`;
        return;
    }

    const matches = outputFolders.filter(entry =>
        entry.path.toLocaleLowerCase().includes(query)
    );
    const visible_matches = matches.slice(0, SEARCH_RESULT_LIMIT);
    for (const entry of visible_matches) {
        results.append(generateListEntry(entry, '#search', 0));
    }
    if (selectedOutputPath) {
        const selected = [
            ...results.querySelectorAll('input[name="gtc_output"]'),
        ].find(input => input.value === selectedOutputPath);
        if (selected) selected.checked = true;
    }
    results.hidden = visible_matches.length === 0;

    if (matches.length === 0) {
        status.textContent = `No folders match “${input.value.trim()}”.`;
    } else if (matches.length > SEARCH_RESULT_LIMIT) {
        status.textContent = `${matches.length.toLocaleString()} matches. Showing the first ${SEARCH_RESULT_LIMIT}; refine the search to narrow the list.`;
    } else {
        status.textContent = `${matches.length.toLocaleString()} matching folder${matches.length === 1 ? '' : 's'}.`;
    }
}

function setup_folder_selection() {
    document
        .querySelector('#folder_form')
        .addEventListener('change', event => {
            if (event.target.matches('input[name="gtc_output"]')) {
                selectedOutputPath = event.target.value;
                update_folder_selection_status(event.target.value);
            }
        });
}

function update_folder_selection_status(selected_path) {
    const selected =
        selected_path ||
        selectedOutputPath ||
        document.querySelector('input[name="gtc_output"]:checked')?.value;
    document.querySelector('#folder-selection-status').textContent = selected
        ? `Selected folder: ${selected}`
        : 'No folder selected. Submitting will open the most recently updated folder.';
}

function setup_server_comm_btns() {
    const get_file_tree = api =>
        wrap(
            addLoadingIndicator(async event => {
                event.preventDefault();
                await fetch_and_populate_folder(api);
            })
        );
    const sync_btn = document.querySelector('#sync_cache');
    sync_btn.addEventListener('click', get_file_tree('/fileTree'));
    document
        .querySelector('#scan_folder')
        .addEventListener('click', get_file_tree('/scan'));

    sync_btn.sync_time = Date.now();
    const duration_span = sync_btn.querySelector('#duration');
    function update_timer() {
        const duration = (Date.now() - sync_btn.sync_time) / 1000;
        if (duration < 120) {
            setTimeout(update_timer, 1000);
            duration_span.innerText = `${duration.toFixed()}s`;
        } else {
            setTimeout(update_timer, 60 * 1000);
            duration_span.innerText = `${(duration / 60).toFixed()}m`;
        }
    }

    setTimeout(update_timer, 1000);
}

async function fetch_and_populate_folder(api) {
    const status = document.querySelector('#folder-list-status');
    set_server_comm_disabled(true);
    status.textContent =
        api === '/scan'
            ? 'Scanning the server folders. This may take a while…'
            : 'Loading the cached folder list…';
    try {
        await update_folder_list(api);
    } catch (error) {
        status.textContent = `Could not load the folder list: ${error.message}`;
        throw error;
    } finally {
        set_server_comm_disabled(false);
    }
}

async function update_folder_list(api) {
    const response = await fetch(api);
    if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
    }
    const { file_tree, server_uptime, last_scan_time } = await response.json();
    document.querySelector('#duration').innerText = '0s';

    // this method might be over complicated
    // If a list if expanded, update its content after animation (done by adding an one-shot event listener), otherwise do it immediately
    const list_filler = (id, handler) => {
        const ul = document.getElementById(id);
        let no_transition = true;
        for (const li of ul.children) {
            const btn = li.querySelector('.collapsible');
            if (btn?.innerText === '-') {
                const after = () => {
                    handler(file_tree);
                    ul.removeEventListener('transitionend', after);
                };
                ul.addEventListener('transitionend', after);
                btn.click();
                no_transition = false;
            }
        }
        no_transition && handler(file_tree);
    };
    [
        ['recent_ul', populate_recent],
        ['outer_ul', bind_file_tree],
    ].forEach(args => list_filler(...args));

    show_banner(server_uptime, last_scan_time);
    document.querySelector('#sync_cache').sync_time = Date.now();
    document.querySelector('#folder-list-status').textContent =
        `${file_tree.count.files.toLocaleString()} GTC output folders found. ` +
        `Last disk scan ${duration_text(server_uptime - last_scan_time)} ago.`;
}

function set_server_comm_disabled(disabled) {
    document.querySelectorAll('.server_comm').forEach(btn => {
        btn.disabled = disabled;
    });
}

function bind_file_tree(file_tree) {
    const outer_ul = document.querySelector('#outer_ul');
    outer_ul.firstElementChild?.remove();
    outer_ul.append(generateListEntry(file_tree));

    // Set outer ul height
    outer_ul.classList.add('active_list');
    outer_ul.style.height = `${outer_ul.scrollHeight}px`;
}

function show_banner(server_uptime, last_scan_time) {
    const banner = document.querySelector('#banner');
    clearTimeout(banner.hide);
    clearTimeout(banner.fade);

    banner.style.display = 'initial';
    setTimeout(() => {
        banner.style.opacity = '1';
    }, 50);
    banner.querySelector('#server_uptime').innerText =
        duration_text(server_uptime);
    banner.querySelector('#last_scan_duration').innerText = `${(
        (server_uptime - last_scan_time) /
        60000
    ).toFixed()}m`;

    // Changing display or visibility dose not trigger transition
    banner.fade = setTimeout(() => {
        banner.style.opacity = '0';
        banner.hide = setTimeout(() => {
            banner.style.display = 'none';
        }, 500);
    }, 10 * 1000);
}

function duration_text(time) {
    time /= 1000;
    if (time < 120) {
        return `${time.toFixed(3)}s`;
    }

    const sec = time % 60;
    const min = ((time - sec) / 60) % 60;
    const hr = ((time - sec - min * 60) / 3600) % 24;
    const day = (time - sec - min * 60 - hr * 3600) / 86400;

    const time_string = `${hr.toString().padStart(2, '0')}:${min
        .toString()
        .padStart(2, '0')}:${sec.toFixed(0).padStart(2, '0')}`;
    if (day > 0) {
        return `${day}-${time_string}`;
    } else {
        return time_string;
    }
}
