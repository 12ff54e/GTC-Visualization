window.addEventListener('load', () => {
    registerServiceWorker();

    const listButtons = document.getElementsByClassName('collapsible');
    for (let btn of listButtons) {
        btn.addEventListener('click', function (event) {
            event.preventDefault();
            const content = this.parentElement.parentElement.nextElementSibling;
            content.classList.toggle('active_list');
            if (content.classList.contains('active_list')) {
                setHeight(content, 1.3 * calcListHeight(content));
                this.innerText = '-';
            } else {
                setHeight(
                    content.parentElement,
                    -parseFloat(content.style.height.split(/[a-zA-Z]/, 1)[0])
                );
                content.style.height = '';
                this.innerText = '+';
            }
        });
    }

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
    outer_ul.style.height = `${calcListHeight(outer_ul)}em`;
});

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

function registerServiceWorker() {
    const folderPicker = document.querySelector('#local_file_picker');
    folderPicker.disabled = true;
    if (!('serviceWorker' in navigator)) {
        document.querySelector('#local_file_picker').disabled = true;
        console.log('Your browser do not support service worker!');
        return;
    }

    navigator.serviceWorker.register('/sw.js').catch(err => {
        console.error(`Service Worker registration failed with ${err}`);
    });

    navigator.serviceWorker.ready.then(reg => {
        // TODO: Use auto submitting form instead of a bare input
        folderPicker.addEventListener('change', e => {
            const files = [];
            const streams = [];
            for (const file of e.target.files) {
                files.push({
                    webkitRelativePath: file.webkitRelativePath,
                    stream: file.stream(),
                });
                streams.push(files.at(-1).stream);
            }
            if (
                files.some(file =>
                    file.webkitRelativePath.match(/[^\/]+\/gtc.out/)
                )
            ) {
                reg.active.postMessage(files, streams);
                const snapFiles = files
                    .map(({ webkitRelativePath }) => {
                        const match = webkitRelativePath.match(
                            /[^\/]+\/(snap[\d]+.out)/
                        );
                        return match ? match[1] : '';
                    })
                    .filter(name => name.length > 0);
                window.location.href = `/local/plot?snapFiles=${encodeURIComponent(
                    btoa(snapFiles)
                )}`;
            } else {
                alert('No gtc.out in this folder!');
            }
        });
        folderPicker.disabled = false;
    });
}
