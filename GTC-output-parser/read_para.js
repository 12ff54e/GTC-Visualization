const path = require('path');
const fs = require('fs').promises;

// RegExp for output in the form 'var' = 'value'
const regexp = /\s*(?<key>[\w_]+)\s*=\s*(?<value>[\d.E+-]+)/i;

module.exports = async function (dir) {
    const file1 = path.join(dir, 'gtc.out');
    const file2 = path.join(dir, 'gtc.out0');
    let outputData;

    // try to read 'gtc.out' first, then 'gtc.out0' if the former
    //  one did not exist
    try {
        outputData = await fs.readFile(file1, 'utf8');
        console.log(`${file1} read`);
    } catch (err) {
        try {
            outputData = await fs.readFile(file2, 'utf8');
            console.log(`${file2} read`);
        } catch (err) {
            throw new Error("No gtc.out found in this directory");
        }
    }

    // filter out lines consist of '='
    const validatedData = outputData
        .split('\n')
        .filter(line => !line.includes('==') && line.includes('='));

    // return all the parameters capsuled in a object
    const params = new Object();
    validatedData
        .forEach(line => {
            let regexMatch;
            if (regexMatch = line.match(regexp)) {
                const g = regexMatch.groups;
                let value;
                if (g.value.includes('.')) {
                    value = parseFloat(g.value);
                } else {
                    value = parseInt(g.value);
                }
                // n modes and m modes are list of mode numbers
                if (g.key === 'nmodes' || g.key === 'mmodes') {
                    value = line
                        .substring(8)
                        .trim()
                        .split(/\s+/)
                        .map(str => parseInt(str));
                }
                if(params[g.key.toLowerCase()] === undefined) {
                    params[g.key.toLowerCase()] = value;
                }
            }
        });

    return params;
}
