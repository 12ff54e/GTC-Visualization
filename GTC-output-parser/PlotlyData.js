/**
 * PlotlyData is a wrapper for all the data
 *  and options in Plotly figure function. 
 * It is used for sending data of figure to client.
 * 
 * @param {Number} len The length of data to be plotted. Set this var
 *  when you want to assign data entries one by one.
 * @param {Number} num Data series number in figure
 */
class PlotlyData {
    constructor(num = undefined, len = undefined) {
        if (typeof num === 'number') {
            this.data = new Array(num);
            for (let i = 0; i < num; i++) {
                if (typeof len === 'number') {
                    this.data[i] = new Array(len + 1);
                } else {
                    this.data[i] = new Array();
                }
            }
        } else {
            this.data = new Array();
        }
        this.layout = PlotlyData._defaultLayout();
    }

    /**
     * Add x coordinates [min*dx, (min+1)*dx, ..., (min+n-1)*dx] to a trace.
     * 
     * @param {number} dx default value 1
     * @param {number} min default value 1
     */
    addX(dx = 1, min = 1) {
        for (let trace of this.data) {
            if (!trace.x) {
                trace.x = [...Array(trace.y.length).keys()].map(i => (i + min) * dx);
            }
        }
    }

    hideCarpetGridTicks() {
        let axisStyle = {
            showticklabels: "none",
            smoothing: 1,
        }

        for (let trace of this.data) {
            if (trace.type === 'carpet') {
                trace.aaxis = {...axisStyle};
                trace.baxis = {...axisStyle};
                return;
            }
        }
    }

    /**
     * hide grid lines in carpet
     */
    hideCarpetGrid() {
        let axisStyle = {
            startline: false,
            endline: false,
            showticklabels: "none",
            smoothing: 1,
            showgrid: false
        }

        for (let trace of this.data) {
            if (trace.type === 'carpet') {
                trace.aaxis = {...axisStyle};
                trace.baxis = {...axisStyle};
                return;
            }
        }
    }

    /**
     * @param {{ x: string; y: string; }} label
     */
    set axesLabel(label) {
        this.layout.xaxis.title = label.x;
        this.layout.yaxis.title = label.y;
    }

    /**
     * @param {string} label
     */
    set plotLabel(label) {
        this.layout.title = label;
    }

    static _defaultLayout() {
        return {
            title: 'Plot',
            xaxis: {
                hoverformat: '.4g',
                tickformat: '.4g'
            },
            yaxis: {
                hoverformat: '.4g',
                tickformat: '.4g'
            }
        }
    }
}

module.exports = PlotlyData;
