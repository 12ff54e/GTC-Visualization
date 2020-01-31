// register plot type tabs
let switches = document.getElementsByClassName('tab-l0-switch');
for (let swc of switches) {
    swc.onchange = async function () {
        // link radio id to panel id
        let panelName;
        switch (swc.id) {
            case 'History':
                panelName = 'hist-panel';
                break;
            case 'Equilibrium':
                panelName = 'eq-panel';
                break;
            case 'Snapshot':
                panelName = 'snap-panel';
                break;
            case 'Radial-Time':
                panelName = 'rt-panel'
                break;
            case 'Field-Mode':
                panelName = 'fml-panel';
        }

        // inform the server about which .out file should be parsed
        let res = await fetch(`plotType/${swc.id}`);
        // wait for the response, then active buttons for plotting
        if (res.ok) {
            console.log(`server: ${await res.text()}`);
            let buttons = document.getElementById(panelName).children;
            for (let btn of buttons) {
                btn.removeAttribute('disabled');
            }
        }

    }
}

// register plot buttons
let buttons = document.getElementsByClassName('tab-l1-btn');
for (let btn of buttons) {
    btn.onclick = async function () {

        let figObj = await fetch(`data/${btn.id}`);
        let figure = await figObj.json();
        Plotly.newPlot('figure', figure[0].data, figure[0].layout);
    }
}
