window.onload = _ => {
    for (let btn of document.getElementsByClassName("collapsible")) {
        btn.addEventListener("click", function (event) {
            event.preventDefault();
            this.classList.toggle("active");
            let parent = this.parentElement;
            let content = parent.children[parent.childElementCount - 1];
            if (content.style.height) {
                content.style.height = null;
                this.innerText = '+';
            } else {
                content.style.height = "auto"//content.scrollHeight + "px";
                this.innerText = '-';
            }
        });
    }

    for (let div of document.getElementsByClassName('mod')) {
        div.addEventListener('click', function (event) {
            for(let sub of this.children) {
                if (sub.style.display == 'none') {
                    sub.style.display = 'block';
                } else {
                    sub.style.display = 'none';
                }
            }
        })
    }
}