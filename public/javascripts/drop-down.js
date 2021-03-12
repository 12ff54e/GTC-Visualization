window.onload = _ => {
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
}

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