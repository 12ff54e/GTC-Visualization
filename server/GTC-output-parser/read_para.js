const path = require('path');
const fs = require('fs').promises;

// RegExp for output in the form 'var' = 'value'
const regexp = /^\s*(?<key>[\w_]+)\s*=\s*(?<value>[\d.E+-]+)/i;

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
            throw new Error('No gtc.out found in this directory');
        }
    }

    // filter out lines consist of '='
    const validatedData = outputData
        .split('\n')
        .filter(line => !line.includes('==') && line.includes('='));

    // return all the parameters capsuled in a object
    const params = new Object();
    validatedData.forEach(line => {
        let regexMatch;
        if ((regexMatch = line.match(regexp))) {
            const g = regexMatch.groups;
            let value;
            if (g.value.includes('.')) {
                value = parseFloat(g.value);
            } else {
                value = parseInt(g.value);
            }
            // n modes and m modes are list of mode numbers
            if (g.key === 'nmodes' || g.key === 'mmodes') {
                return;
            }
            if (params[g.key.toLowerCase()] === undefined) {
                params[g.key.toLowerCase()] = value;
            }
        } else if (
            (regexMatch = line.match(
                /^\s*rg0,\s*rg1\s*=\s*(?<r0>[\d.Ee+-]+)\s+(?<r1>[\d.Ee+-]+).*/i
            ))
        ) {
            params['radial_region'] = [
                parseFloat(regexMatch.groups.r0),
                parseFloat(regexMatch.groups.r1),
            ];
        }
    });

    // "tstep in seconds:    1.61809623E-07" — uses ':' instead of '=', so it
    // is not captured by the regex above. Parse it separately and store it as
    // `tstep_seconds` (the SI duration of one simulation step).
    {
        const m = outputData.match(
            /^\s*tstep\s+in\s+seconds\s*:\s*(?<value>[\d.Ee+-]+)/im
        );
        if (m) {
            params['tstep_seconds'] = parseFloat(m.groups.value);
        }
    }

    // n and m modes, works for v4.3 onward

    const getModeNumbers = (key, from = 0) => {
        const begin = outputData.indexOf(key, from) + 8;
        const end =
            begin +
            outputData.substring(begin).match(/\d\s+[A-Za-z]/).index +
            1;
        return {
            end,
            modes: outputData
                .substring(begin, end)
                .trim()
                .split(/\s+/)
                .map(str => parseInt(str)),
        };
    };

    params['nmodes'] = getModeNumbers('nmodes').modes;
    params['mmodes'] = getModeNumbers('mmodes').modes;

    return params;
};
