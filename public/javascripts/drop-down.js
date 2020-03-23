window.onload = _ => {
    for (let btn of document.getElementsByClassName("collapsible")) {
        btn.addEventListener("click", function (event) {
            event.preventDefault();
            const content = this.parentElement.nextElementSibling;
            content.classList.toggle("active_list");
            if (content.classList.contains('active_list')) {
                setHeight(content, 1.4 * calcListHeight(content))
                this.innerText = '-';
            } else {
                setHeight(content.parentElement,
                    -parseFloat(content.style.height.split(/[a-zA-Z]/, 1)[0])
                );
                content.style.height = "";
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
        })
    }
}

function calcListHeight(ul) {
    return ul.classList.contains('active_list')
        ? Array.from(ul.children).reduce((sum, curr) => {
            const itemHeight = curr.localName === 'li'
                ? 1
                : calcListHeight(curr)
            return sum + itemHeight;
        }, 0)
        : 0;
}

function setHeight(elem, height) {
    if (elem.localName === 'ul') {
        const prevHeight = elem.style.height.split(/[a-zA-Z]/, 1)[0];
        elem.style.height = `${height + (prevHeight ? parseFloat(prevHeight) : 0)}rem`;
        setHeight(elem.parentElement, height);
    }
}