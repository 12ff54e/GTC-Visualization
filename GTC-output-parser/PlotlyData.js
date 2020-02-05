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
     * Add x coordinates [dx, 2dx, ..., n*dx] to a trace.
     */
    addX(dx = 1) {
        for (let trace of this.data) {
            if (!trace.x) {
                trace.x = [...Array(trace.y.length).keys()].map(i => (i + 1) * dx);
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
            xaxis: {hoverformat: '.4e'},
            yaxis: {hoverformat: '.4e'},
        }
    }
}

module.exports = PlotlyData;

// function legendFormatter(data) {
//     if (data === undefined) {
//         // This happens when there's no selection and {legend: 'always'} is set.
//         return '<br>' + data.series.map(function (series) { return series.dashHTML + ' ' + series.labelHTML }).join('<br>');
//     }

//     var html = this.getLabels()[0] + ': ' + data.xHTML;
//     data.series.forEach(function (series) {
//         if (!series.isVisible) return;
//         var labeledData = series.labelHTML + ': ' + series.yHTML;
//         if (series.isHighlighted) {
//             labeledData = '<b>' + labeledData + '</b>';
//         }
//         html += '<br>' + series.dashHTML + ' ' + labeledData;
//     });
//     return html;
// }

// /**
//  * Transpose first two level of the array
//  * 
//  * @returns {Array} the transposed array
//  */
// Array.prototype.transpose = function () {
//     let subLen = this[0].length;
//     let transposed = new Array(subLen);

//     for (let i = 0; i < subLen; i++) {
//         transposed[i] = new Array(this.length);
//         for (let j = 0; j < this.length; j++) {
//             transposed[i][j] = this[j][i];
//         }
//     }

//     return transposed;
// }
