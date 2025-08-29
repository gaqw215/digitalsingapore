/* validator.js */
(function () {
    function typeOf(v) {
        if (v === null) return 'null';
        if (Array.isArray(v)) return 'array';
        return typeof v;
    }

    function validateAgainstSchema(data, schema, path = '') {
        const errors = [];
        const warnings = [];

        const addE = (msg) => errors.push(path ? `${path}: ${msg}` : msg);
        const addW = (msg) => warnings.push(path ? `${path}: ${msg}` : msg);

        // anyOf: at least one schema must pass
        if (schema.anyOf) {
            const results = schema.anyOf.map((s) => validateAgainstSchema(data, s, path));
            const ok = results.some((r) => r.errors.length === 0);
            if (!ok) {
                addE('Value must match one of the allowed shapes.');
                results.forEach((r, i) => r.errors.forEach((e) => addW(`anyOf[${i}] → ${e}`)));
            } else {
                const firstOK = results.find((r) => r.errors.length === 0);
                warnings.push(...firstOK.warnings);
            }
            return { errors, warnings };
        }

        const t = typeOf(data);
        if (schema.type && schema.type !== t) {
            addE(`Expected type "${schema.type}" but got "${t}".`);
            return { errors, warnings };
        }

        if (schema.type === 'object') {
            const props = schema.properties || {};
            const req = schema.required || [];
            req.forEach((k) => {
                if (!(k in (data || {}))) addE(`Missing required key "${k}".`);
            });
            for (const [k, v] of Object.entries(data || {})) {
                const childSchema = props[k];
                if (!childSchema) continue; // allow extra keys
                const { errors: e2, warnings: w2 } = validateAgainstSchema(v, childSchema, path ? `${path}.${k}` : k);
                errors.push(...e2);
                warnings.push(...w2);
            }
            if (schema.custom && typeof schema.custom === 'function') {
                try {
                    const msg = schema.custom(data);
                    if (typeof msg === 'string' && msg) addE(msg);
                } catch (e) {
                    addE(`Custom validator threw: ${e.message}`);
                }
            }
        }

        if (schema.type === 'array') {
            const itemSchema = schema.items || {};
            (data || []).forEach((item, i) => {
                const { errors: e2, warnings: w2 } = validateAgainstSchema(item, itemSchema, `${path}[${i}]`);
                errors.push(...e2);
                warnings.push(...w2);
            });
            if (schema.minItems != null && (data || []).length < schema.minItems) {
                addE(`Array has ${(data || []).length} items; expected at least ${schema.minItems}.`);
            }
        }

        if (schema.type === 'string' && schema.pattern) {
            const re = new RegExp(schema.pattern);
            if (!re.test(data)) addE(`String does not match pattern ${schema.pattern}.`);
        }

        return { errors, warnings };
    }

    function showValidationPanel(fileName, errors, warnings) {
        const panel = document.createElement('div');
        panel.style.cssText =
            'background:#fff7ed;color:#7c2d12;border:1px solid #fed7aa;padding:12px;margin:12px;border-radius:10px;font-family:system-ui,Segoe UI,Roboto,sans-serif';
        panel.innerHTML = `
      <strong>JSON validation: <code>${fileName}</code></strong>
      ${errors.length
                ? `<div style="margin-top:8px"><b>Errors (${errors.length}):</b><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`
                : `<div style="margin-top:8px;color:#166534;background:#dcfce7;border:1px solid #bbf7d0;padding:8px;border-radius:8px">No errors found.</div>`
            }
      ${warnings.length ? `<div style="margin-top:8px;color:#854d0e"><b>Warnings (${warnings.length}):</b><ul>${warnings.map((w) => `<li>${w}</li>`).join('')}</ul></div>` : ''}`;
        document.body.prepend(panel);
        if (errors.length) console.error(`[JSON VALIDATION] ${fileName}`, errors);
        if (warnings.length) console.warn(`[JSON VALIDATION] ${fileName}`, warnings);
    }

    async function validateAndRender({ url, schema, mountOnErrorId, render }) {
        try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
            const json = await res.json();

            const { errors, warnings } = validateAgainstSchema(json, schema, url.replace(/\.json$/, ''));
            showValidationPanel(url, errors, warnings);
            if (errors.length) {
                if (mountOnErrorId) {
                    const mount = document.getElementById(mountOnErrorId);
                    if (mount) mount.innerHTML = `<div class="bg-red-100 text-red-700 p-4 rounded">Validation failed for <b>${url}</b>. See details above.</div>`;
                }
                return;
            }
            await render(json);
        } catch (e) {
            console.error(e);
            if (mountOnErrorId) {
                const mount = document.getElementById(mountOnErrorId);
                if (mount) mount.innerHTML = `<div class="bg-red-100 text-red-700 p-4 rounded">Failed to load <b>${url}</b>: ${e.message}</div>`;
            }
        }
    }

    // expose
    window.JSONValidator = { validateAgainstSchema, showValidationPanel, validateAndRender };
})();
