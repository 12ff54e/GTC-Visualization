window.addEventListener('load', (ev) => {
    const form = document.getElementById('input');
    const input_area = form.firstElementChild;

    fetch('/javascripts/input-parameters.json')
        .then((res) => {
            if (res.ok) {
                return res.json();
            } else {
                throw new Error('No input parameters descriptor file found.');
            }
        })
        .then((input_parameters) => {
            const cat = new Map();
            for (const parameter_spec of input_parameters) {
                let cat_div = cat.get(parameter_spec.group);
                if (!cat_div) {
                    cat_div = document.createElement('div');
                    input_area.append(cat_div);
                    cat.set(parameter_spec.group, cat_div);

                    // Add sub title
                    const sub_title = document.createElement('h2');
                    sub_title.innerText = parameter_spec.group;
                    cat_div.append(sub_title);
                }
                cat_div.classList.add('category');
                const input_div = document.createElement('div');
                input_div.classList.add('input_wrapper');

                if (parameter_spec.possible_value) {
                    const select = document.createElement('select');
                    select.name =
                        (parameter_spec.group == 'equilibrium' ? 'eq-' : '') +
                        parameter_spec.name;
                    select.id = parameter_spec.name;
                    for (const v of parameter_spec.possible_value) {
                        const opt = document.createElement('option');
                        opt.value = v;
                        opt.text = v;
                        select.appendChild(opt);
                    }
                    input_div.append(select);
                } else {
                    const input = document.createElement('input');
                    input.name =
                        (parameter_spec.group == 'equilibrium' ? 'eq-' : '') +
                        parameter_spec.name;
                    input.id = parameter_spec.name;
                    input.value =
                        parameter_spec.type == 'array'
                            ? parameter_spec.default.replace(/\s/g, ',')
                            : parameter_spec.default;
                    input.type =
                        parameter_spec.type == 'integer' ? 'number' : 'text';

                    const number_pattern =
                        '-?((\\d*\\.\\d+)|(\\d+\\.\\d*)|(\\d+))(e-?\\d+)?';
                    if (parameter_spec.type == 'real') {
                        input.pattern = number_pattern;
                    }

                    input_div.append(input);
                }

                const label = document.createElement('label');
                label.setAttribute('for', parameter_spec.name);
                label.innerText = parameter_spec.name + '=';
                input_div.prepend(label);

                const description = document.createElement('span');
                description.innerText = parameter_spec.description;
                input_div.append(description);

                cat_div.append(input_div);
            }
        })
        .catch((err) => console.log(err));
});
