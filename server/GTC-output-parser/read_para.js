// RegExp for output in the form 'var' = 'value'
const regexp = /^\s*(?<key>[\w_]+)\s*=\s*(?<value>[\d.E+-]+)/i;

/**
 *
 * @param {string} outputData
 * @returns
 */
module.exports = async function (outputData) {
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
