let buttons = document.getElementsByClassName('tab-l1-btn');

for (let btn of buttons) {
    btn.onclick = async function () {

        let figObj = await fetch(`data/${btn.id}`);
        let figure = await figObj.json();
        new Dygraph(document.getElementById("figure"),
            figure.data,
            {
                // Axes label
                xlabel: figure.axesLabel[0],
                ylabel: figure.axesLabel[1],
                // Legend
                labels: figure.axesLabel,
                legend: "always"
                // Line style
            });
    }
}
