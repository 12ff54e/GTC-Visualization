window.addEventListener(
    'load',
    wrap(async event =>
        addLoadingIndicator(async () => {
            const fileTree = await (await fetch('/fileTree')).json();
            // add root entry
            document
                .querySelector('#outer_ul')
                .append(generateListEntry(fileTree));

            for (let div of document.getElementsByClassName('mod')) {
                div.addEventListener('click', function (event) {
                    for (let sub of this.children) {
                        if (sub.style.display == 'none') {
                            sub.style.display = 'block';
                        } else {
                            sub.style.display = 'none';
                        }
                    }
                });
            }

            for (let btn of document.querySelector('.ctrl').children) {
                btn.addEventListener('click', function (event) {
                    event.preventDefault();
                    for (let btn of listButtons) {
                        if (
                            btn.innerHTML ===
                            (this.innerHTML.includes('Expand') ? '+' : '-')
                        ) {
                            btn.click();
                        }
                    }
                });
            }

            // Set outer ul height
            const outer_ul = document.querySelector('#outer_ul');
            outer_ul.classList.add('active_list');
            outer_ul.style.height = `${1.3 * calcListHeight(outer_ul)}em`;
        })(event)
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
        elem.style.height = `${
            height + (prevHeight ? parseFloat(prevHeight) : 0)
        }em`;
        setHeight(elem.parentElement, height);
    } else if (elem.localName === 'li') {
        setHeight(elem.parentElement, height);
    }
}

function toggleList(btn) {
    const dirEntry = btn.parentElement.parentElement;
    if (!dirEntry.nextElementSibling?.classList.contains('content')) {
        dirEntry.after(generateContent(dirEntry));
    }
    const content = dirEntry.nextElementSibling;
    content.classList.toggle('active_list');
    if (content.classList.contains('active_list')) {
        setHeight(content, 1.3 * calcListHeight(content));
        btn.innerText = '-';
    } else {
        setHeight(
            content.parentElement,
            -parseFloat(content.style.height.split(/[a-zA-Z]/, 1)[0])
        );
        content.style.height = '';
        btn.innerText = '+';
    }
}

function generateContent(dirEntry) {
    const fileTree = dirEntry.dirObj;
    const ul = document.createElement('ul');
    ul.classList.add('content');
    for (const entry of fileTree.content) {
        if (typeof entry === 'string') {
            continue;
        }
        entry.parent = fileTree;
        ul.append(generateListEntry(entry));
    }

    return ul;
}

function generateListEntry(entry) {
    const getPath = fileTree => {
        return fileTree === undefined
            ? []
            : [...getPath(fileTree.parent), fileTree.dirname];
    };
    const li = document.createElement('li');
    const entryContainer = document.createElement('div');
    entryContainer.dirObj = entry;
    li.append(entryContainer);

    if (entry.mTimeMs) {
        // This entry is a gtc output folder
        const path = getPath(entry).join('/');
        const input = document.createElement('input');
        input.setAttribute('id', path);
        input.setAttribute('value', path);
        input.setAttribute('type', 'radio');
        input.setAttribute('name', 'gtc_output');
        const label = document.createElement('label');
        label.setAttribute('for', path);
        label.innerText = entry.dirname;
        const modTime = document.createElement('div');
        modTime.classList.add('mod');
        modTime.innerHTML = `<div style="display:none">${localeISOLikeForm(
            entry.mTimeMs
        )}</div><div>${timeText(entry.mTimeMs)}</div>`;
        entryContainer.append(document.createElement('div'), modTime);
        entryContainer.firstElementChild.append(input, label);
    } else {
        entryContainer.append(document.createElement('div'));
        entryContainer.firstElementChild.innerText = entry.dirname;
    }

    if (entry.count.files === 1 && entry.mTimeMs) {
        // This folder has no sub-folders
        li.classList.add('tip');
    } else {
        const listButton = document.createElement('button');
        listButton.classList.add('collapsible');
        listButton.innerText = '+';
        listButton.addEventListener('click', event => {
            event.preventDefault();
            toggleList(event.target);
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
