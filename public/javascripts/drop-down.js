window.addEventListener(
    'load',
    wrap(
        addLoadingIndicator(async () => {
            const fileTree = await (await fetch('/fileTree')).json();
            // add root entry
            const rootEntry = generateListEntry(fileTree);
            document.querySelector('#outer_ul').append(rootEntry);

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
                        expandEntry(rootEntry);
                    }
                });
            }

            // Set outer ul height
            const outer_ul = document.querySelector('#outer_ul');
            outer_ul.classList.add('active_list');
            outer_ul.style.height = `${1.3 * calcListHeight(outer_ul)}em`;

            const recent_entries = getRecent(fileTree);
            const recent_entry_virtual_folder = {
                dirname: 'Recent Tasks',
                content: recent_entries,
                count: { files: recent_entries.length },
            };
            const recent_ul = document.querySelector('#recent_ul');
            recent_ul.append(
                generateListEntry(recent_entry_virtual_folder, '#recent', 1)
            );
            recent_ul.classList.add('active_list');
            recent_ul.style.height = `${1.3 * calcListHeight(recent_ul)}em`;
        })
    )
);

function calcListHeight(ul) {
    return ul.classList.contains('active_list')
        ? Array.from(ul.children).reduce((sum, curr) => {
              return (
                  sum +
                  (curr.classList.contains('tip')
                      ? 1
                      : 1 + calcListHeight(curr.lastElementChild))
              );
          }, 0)
        : 0;
}

function setHeight(elem, height) {
    if (elem.localName === 'ul') {
        const prevHeight = elem.style.height.split(/[a-zA-Z]/, 1)[0];
        if (height < 0 && prevHeight.length == 0) {
            return;
        }
        elem.style.height = `${
            height + (prevHeight ? parseFloat(prevHeight) : 0)
        }em`;
        setHeight(elem.parentElement, height);
    } else if (elem.localName === 'li') {
        setHeight(elem.parentElement, height);
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
        setHeight(contentUL, 1.3 * calcListHeight(contentUL));
        btn.innerText = '-';
    } else {
        setHeight(
            contentUL.parentElement,
            -parseFloat(contentUL.style.height.split(/[a-zA-Z]/, 1)[0])
        );
        contentUL.style.height = '';
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

        await func(...args);

        loading.style.visibility = 'hidden';
    };
}

/**
 * Get recent entries, also add path to each entry
 * @param file_tree 
 * @returns 
 */
function getRecent(file_tree) {
    const RECENT_ENTRIES_COUNT = 3;
    const recent_entries = [];

    const add_to_recent = entry => {
        recent_entries.push(entry);
        recent_entries.sort((a, b) => b.mTimeMs - a.mTimeMs);
        if (recent_entries.length > RECENT_ENTRIES_COUNT) {
            recent_entries.pop();
        }
    };

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
                entry.path = folder_stack
                    .map(p => p[0].dirname)
                    .join('/')
                    .concat(`/${entry.dirname}`);
                add_to_recent(entry);
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

    return recent_entries;
}
