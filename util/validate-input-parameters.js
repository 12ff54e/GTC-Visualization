const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');

const projectRoot = path.join(__dirname, '..');
const inputParametersDir = path.join(projectRoot, 'client', 'gtc-input');
const schemaPath = path.join(
    projectRoot,
    'server',
    'input-parameters-schema.json'
);

async function validateInputParameters() {
    const filenames = (await fs.readdir(inputParametersDir))
        .filter(filename => /^input-parameters-v.*\.json$/.test(filename))
        .sort();

    if (filenames.length === 0) {
        throw new Error(
            `No input parameter descriptors found in ${inputParametersDir}`
        );
    }

    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    const validate = new Ajv().compile(schema);
    const failures = [];

    for (const filename of filenames) {
        const filePath = path.join(inputParametersDir, filename);
        const inputParameters = JSON.parse(await fs.readFile(filePath, 'utf8'));

        if (!validate(inputParameters)) {
            failures.push({ filename, errors: validate.errors });
        }
    }

    if (failures.length > 0) {
        const details = failures
            .map(
                ({ filename, errors }) =>
                    `${filename}:\n${JSON.stringify(errors, null, 2)}`
            )
            .join('\n');
        throw new Error(`Input parameter schema validation failed:\n${details}`);
    }

    console.log(
        `Validated ${filenames.length} input parameter descriptor(s) against the schema.`
    );
}

validateInputParameters().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
});
