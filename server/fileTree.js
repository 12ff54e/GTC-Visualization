const path = require('path');
const fsp = require('fs').promises;

/**
 * A recursive file tree object
 */
class FileTree {
    /**
     * @param {string} dirname 
     * @param {Array<string | FileTree>} content 
     * @param {Array<number>} count 
     */
    constructor(dirname = '', content = [], count = [0, 0]) {
        this.dirname = dirname;
        this.content = content;
        this.count = { files: count[0], folders: count[1] };
    }

    /**
     * @param {number[]} count
     */
    set stats(count) {
        this.count = { files: count[0], folders: count[1] };
    }

    toHTML1(prefix = '/file', parent = 'ul', siblings = 'li') {
        let listHeader = `<button class='collapsible'>${this.dirname}</button>\n<${parent} class='content'>\n`;
        let content = this.content.map(item => {
            if (typeof item === 'string') {
                return `<${siblings}><a href=${path.join(prefix, encodeURI(path.join(this.dirname, item)))}>${item}</a>\n`
            } else {
                return `<${siblings}>` + item.toHTML1(path.join(prefix, encodeURI(this.dirname)));
            }
        })

        return listHeader + content.join('') + `</${parent}>\n`
    }

    // TODO: REFACTOR!!!
    toHTML2(root = true) {
        let id;
        if (this.mTimeMs) {
            // This entry is a gtc output folder
            const folderPath = encodeURI(this.path);
            const input = `<input id="${folderPath}" value="${folderPath}" type="radio" name="gtc_output">`;
            const label = `<label for="${folderPath}">${this.dirname}</label>`;

            const modTime = `<div class="mod"><div style="display:none">${localeISOLikeForm(
                this.mTimeMs
            )}</div><div>${timeText(this.mTimeMs)}</div></div>`;

            id = (div = '') =>
                `${div}${div}${input}${label}</div>${modTime}</div>`;
        } else {
            // This entry is just a folder
            id = () => `${this.dirname}</div></div>`;
        }
        if (this.content.length == 1 && this.mTimeMs) {
            // This folder has no sub-folders
            return `<li class="tip">${id('<div>')}</li>`;
        } else {
            const listHeader =
                `<li><div><div><button class="collapsible">+</button>${id()}` +
                '<ul class="content">';
            return (
                listHeader +
                this.content
                    .map((item) =>
                        typeof item === 'string' ? '' : item.toHTML2(false)
                    )
                    .join('') +
                '</ul></li>'
            );
        }
    }


    /**
     * Overrides object's toString method
     * 
     * @param {number} indent controls the indent of each line
     */
    toString(indent = 0) {
        let space = (n) => {
            return ' '.repeat(n);
        }

        let content = this.content.map(item => {
            if (typeof item === 'string') {
                return space(indent + 2) + item;
            } else {
                return space(indent + 2) + item.toString(indent + 2);
            }
        })

        return this.dirname + '\n' + content.join('\n');
    }

    /**
     * This static method reads all files and folders in dir and return a FileTree object
     *  
     * @param {string} dir is the directory path to be scanned
     * 
     * @return {Promise<FileTree>} a FileTree object promise
     * 
     */
    static async readFileTree(dir) {
        let tree = await fsp.readdir(dir, { encoding: 'utf-8', withFileTypes: true });
        let folder = tree.map(async item => {
            if (item.isFile()) {
                return item.name;
            } else if (item.isDirectory()) {
                return FileTree.readFileTree(path.join(dir, item.name));
            } else if(item.isSymbolicLink()) {
                try {
                    const realpath = await fsp.realpath(
                        path.join(dir, item.name)
                    ); // realpath syscall might throw when the symlink can not be resolve
                    return (await fsp.stat(realpath)).isDirectory()
                        ? FileTree.readFileTree(realpath)
                        : null;
                } catch (e) {
                    return null;
                }
            } else {
                return null;
            }
        })

        return Promise.all(folder).then(content => {
            // filter out null entries
            const filtered = content.filter(i => i);
            const count = filtered.reduce((acc, curr) => {
                if (typeof curr === 'string') {
                    acc[0] += 1;
                } else {
                    acc[0] += curr.count.files;
                    acc[1] += curr.count.folders;
                }

                return acc;
            }, [0, 1]);
            return new this(path.basename(dir), filtered, count);
        });
    }

    /**
     * This method searches files in FileTree using filter function
     * 
     * @param {function | string} filter function accepting file name, or just filename
     * @param {string} prefix optional, it will be prepended to the returned path
     * 
     * @return {Array<{name: string, path: string}>}
     */
    search(filter, prefix = '') {
        let prefix_new = path.join(prefix, this.dirname);
        filterFun = typeof filter === 'string' ? (str) => str === filter : filter;
        return this.content.reduce((acc, curr) => {
            if (typeof curr === 'string') {
                if (filterFun(curr)) acc.push({ name: curr, path: path.join(prefix_new, curr) });
            } else {
                acc = acc.concat(curr.search(filterFun, prefix_new));
            }
            return acc;
        }, new Array());
    }

    /**
     * This method searches files in fileTree and return the filtered fileTree
     * @param {function | string} condition 
     * @param {function} postProcess
     */
    filter(condition, postProcess) {
        const result = new FileTree(this.dirname);
        const filterFun =
            typeof condition === 'string' ? (str) => str === condition : condition;
        const postFun = (arr) => { arr.push(result); return postProcess(arr) };
        const count = [0, 0];
        const content = this.content.reduce((acc, curr) => {
            if (typeof curr === 'string') {
                if (filterFun(curr)) {
                    acc.push(postProcess ? postFun([curr]) : curr);
                    count[0] += 1;
                }
            } else {
                let sub = postProcess
                    ? curr.filter(filterFun, postFun)
                    : curr.filter(filterFun);
                if (sub.content.length) {
                    acc.push(sub);
                    count[0] += sub.count.files;
                    count[1] += sub.count.folders;
                }
            }

            return acc;
        }, new Array());

        if (content.length) count[1] += 1;

        result.content = content;
        result.stats = count;
        return result;
    }
}

module.exports = FileTree;

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
        text = `${num[Math.floor(timeDiff / 3600) - 1]} hour${timeDiff < 7200 ? '' : 's'} ago`;
    } else if (now.toDateString() === before.toDateString()) {
        text = before.toTimeString().substring(0, 5);
    } else if (now.getFullYear() === before.getFullYear()) {
        text = before.toDateString().slice(0, -5);
    } else {
        text = before.toDateString();
    }

    return text;
}

function localeISOLikeForm(time) {
    const date = new Date(time);
    // manually shift time by time zone
    const shifted = new Date(date - date.getTimezoneOffset() * 60000);

    return shifted.toISOString().split(/[TZ]/, 2).join(' ');
}