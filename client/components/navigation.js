'use strict';

/**
 * Breadcrumb navigation setup for the GTC Visualization plot page.
 *
 * This module handles the server-side file-tree-driven breadcrumb bar:
 *   - Fetches `GET /fileTree` on load
 *   - Constructs dropdown folder lists for each breadcrumb segment
 *   - Manages expand / collapse and click-outside-to-close behaviour
 *   - Wires the "copy path" button (clipboard API with fallback)
 *
 * @module navigation
 */

import { wrap } from './status-bar.js';
import { propagateFetchError, nodeIs, postForm } from '../shared/util.js';

/**
 * Initialise the breadcrumb bar and copy-path button.
 * Must be called once after the DOM is ready (inside the `load` handler).
 */
export function setupBreadcrumbs() {
    const navi_segments = [
        ...document.querySelector('#breadcrumb-container').children,
    ];

    const fitDropdown = dropdown => {
        // Measure from the anchor again after a resize or a different menu opens.
        dropdown.style.left = '0';
        const { left, right } = dropdown.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const offset = Math.max(
            8 - left,
            Math.min(0, viewportWidth - 8 - right)
        );
        dropdown.style.left = `${offset}px`;
    };

    window.addEventListener('resize', () => {
        for (const segment of navi_segments) {
            const dropdown = segment.lastElementChild;
            if (dropdown.classList.contains('active')) {
                fitDropdown(dropdown);
            }
        }
    });

    const clearDropdown = exception => {
        navi_segments.forEach(s => {
            if (s === exception) {
                return;
            }
            s.classList.remove('active');
            for (const child of s.children) {
                child.classList.remove('active');
            }
        });
    };

    // Fetch file tree and populate dropdowns
    wrap(async () => {
        const res = await fetch('/fileTree');
        await propagateFetchError(res);
        const { file_tree } = await res.json();

        const constructPath = entry => {
            return entry
                ? `${constructPath(entry.parent)}/${entry.dirname}`
                : '';
        };

        // add drop down list
        const constructFolderContentList = (parent, child) => {
            const ul = document.createElement('ul');

            if (parent === undefined) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '/';
                a.innerText = '(Go Back to File Tree View)';
                li.classList.add('breadcrumb-dropdown-item');
                li.appendChild(a);
                ul.appendChild(li);
                return ul;
            }

            for (const entry of parent.content) {
                if (typeof entry === 'string') {
                    continue;
                }
                entry.parent = parent;
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.innerText = entry.dirname;
                li.appendChild(a);

                li.classList.add('breadcrumb-dropdown-item');
                if (child?.dirname === entry.dirname) {
                    li.classList.add('current-item');
                }

                if (entry.mTimeMs) {
                    // a gtc output folder
                    a.addEventListener('click', () => {
                        postForm('/plot', { gtc_output: constructPath(entry) });
                    });
                    const span = document.createElement('span');
                    span.innerText = 'gtc.out';
                    span.classList.add('output');
                    li.appendChild(span);
                }

                if (entry.count.folders > 1) {
                    // a folder contains subfolders
                    li.classList.add('folder');
                    li.appendChild(constructFolderContentList(entry));
                    li.addEventListener('click', event => {
                        event.stopPropagation();
                        event.currentTarget.classList.toggle('folder-expand');
                        fitDropdown(li.closest('.breadcrumb-dropdown'));
                    });
                }
                ul.appendChild(li);
            }

            return ul;
        };

        let currentEntry = undefined;
        navi_segments.forEach((seg, idx) => {
            // first span is the copy button
            if (idx == 0) {
                return;
            }
            const parentEntry = currentEntry;
            currentEntry = currentEntry
                ? currentEntry.content.find(
                      f => f.dirname === seg.firstElementChild.innerText
                  )
                : file_tree;

            seg.lastElementChild.append(
                constructFolderContentList(parentEntry, currentEntry)
            );
            seg.addEventListener('click', event => {
                clearDropdown(event.currentTarget);
                for (const child of event.currentTarget.children) {
                    child.classList.toggle('active');
                }
                const dropdown = event.currentTarget.lastElementChild;
                if (dropdown.classList.contains('active')) {
                    fitDropdown(dropdown);
                }
            });
        });

        // clear dropdown when clicked on other parts on the page
        document.addEventListener('click', event => {
            if (
                !nodeIs(event.target, elem =>
                    elem.classList.contains('breadcrumb-item')
                )
            ) {
                clearDropdown();
            }
        });
    })();

    // button for copy path
    document.getElementById('copy-path').addEventListener(
        'click',
        wrap(async ev => {
            const path = document.getElementById('entry-path').innerText;
            if (!navigator.clipboard) {
                clearDropdown();
                const div = ev.target.nextElementSibling;
                div.classList.toggle('active');
                if (div.classList.contains('active')) {
                    fitDropdown(div);
                }
                if (window.getSelection) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(div.firstElementChild);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
                return;
            }
            await navigator.clipboard.writeText(path);
            const btn = ev.target;
            const icon = btn.innerText;
            btn.innerText = 'check';
            btn.disabled = true;
            setTimeout(() => {
                btn.innerText = icon;
                btn.disabled = false;
            }, 500);
        })
    );
}
