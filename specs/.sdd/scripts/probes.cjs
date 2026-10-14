'use strict';
/**
 * probes.cjs — derive edge-case probe cases from an OpenAPI document (used by `oracle.cjs gen-probes`).
 *
 * Probes carry requests only. `oracle diff` sends them to two builds and compares what comes back,
 * so every probe widens the surface on which equivalence is measured without anyone writing
 * expectations. The inputs target the places independent builders typically diverge: missing,
 * extra, null and wrong-typed fields, length and range boundaries (counted in code points),
 * whitespace/Unicode round-trips, malformed bodies, content types, idempotency keys, preconditions,
 * pagination parameters, malformed path ids, trailing slashes and undeclared methods — each one
 * tied to the Equivalence Profile rule it exercises.
 */
const L = require('./sdd-lib.cjs');

const FIXED = {
  uuid: '0190a000-0000-7000-8000-00000000a001',
  'date-time': '2026-01-01T00:00:00.000Z',
  date: '2026-01-01',
  email: 'probe@example.com',
  uri: 'https://example.com/probe',
};
const NONEXISTENT_UUID = '0190a000-0000-7000-8000-00000000ffff';
const ROUND_TRIP = '  Ünïcødé ✓  ';
const NFD_SAMPLE = 'Cafe\u0301 probe'; // "e" + combining acute: NFC turns it into "é" (SER-9)
const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function typeOf(s) {
  if (Array.isArray(s.type)) return s.type.find(t => t !== 'null');
  if (s.type) return s.type;
  if (s.properties) return 'object';
  if (s.items) return 'array';
  return undefined;
}

function nullable(s) {
  return s.nullable === true || (Array.isArray(s.type) && s.type.includes('null'));
}

/** Merge allOf branches into one object schema (properties + required). */
function flatten(doc, schema) {
  const s = L.deref(doc, schema) || {};
  if (!Array.isArray(s.allOf)) return s;
  const parts = s.allOf.map(x => flatten(doc, x));
  return {
    ...s,
    type: 'object',
    properties: Object.assign({}, ...parts.map(x => x.properties || {}), s.properties || {}),
    required: [...new Set([...parts.flatMap(x => x.required || []), ...(s.required || [])])],
  };
}

function sample(doc, schema, depth = 0) {
  const s = flatten(doc, schema);
  if (depth > 6) return null;
  if ('example' in s) return s.example;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if ('const' in s) return s.const;
  if ('default' in s) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (s.oneOf || s.anyOf) return sample(doc, (s.oneOf || s.anyOf)[0], depth + 1);
  switch (typeOf(s)) {
    case 'object': {
      const o = {};
      for (const k of s.required || []) o[k] = sample(doc, (s.properties || {})[k] || {}, depth + 1);
      return o;
    }
    case 'array': {
      if (s.maxItems === 0) return [];
      const n = Math.max(s.minItems || 1, 1);
      return Array.from({ length: Math.min(n, s.maxItems ?? n) }, () => sample(doc, s.items || {}, depth + 1));
    }
    case 'string': {
      if (s.format && FIXED[s.format]) return FIXED[s.format];
      let v = 'probe';
      while ([...v].length < (s.minLength || 0)) v += 'x';
      if (s.maxLength !== undefined) v = [...v].slice(0, s.maxLength).join('');
      return v;
    }
    case 'integer':
    case 'number': {
      const lo = s.minimum ?? (s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + 1 : undefined);
      const hi = s.maximum ?? (s.exclusiveMaximum !== undefined ? s.exclusiveMaximum - 1 : undefined);
      return lo !== undefined ? lo : hi !== undefined ? Math.min(1, hi) : 1;
    }
    case 'boolean':
      return false;
    case 'null':
      return null;
    default:
      return 'probe';
  }
}

function idFor(doc, param) {
  const s = L.deref(doc, param.schema) || {};
  if (s.format === 'uuid') return NONEXISTENT_UUID;
  if (typeOf(s) === 'integer' || typeOf(s) === 'number') return '999999999';
  return 'probe-nonexistent';
}

function wrongTypeFor(t) {
  return { string: 12345, integer: 'not-a-number', number: 'not-a-number', boolean: 'yes', array: 'not-an-array', object: 'not-an-object' }[t];
}

/** Can sample() produce a value this schema surely accepts? (No patterns or unknown formats anywhere required.) */
function confident(doc, schema, depth = 0) {
  const s = flatten(doc, schema);
  if (depth > 6) return false;
  if (s.pattern || (s.format && !FIXED[s.format])) return false;
  if ('example' in s || 'const' in s || 'default' in s || Array.isArray(s.enum)) return true;
  const t = typeOf(s);
  if (t === 'object') return (s.required || []).every(k => confident(doc, (s.properties || {})[k] || {}, depth + 1));
  if (t === 'array') return confident(doc, s.items || {}, depth + 1);
  return true;
}

/**
 * For an item operation (/things/{id}/...), find how to create a real resource first:
 * POST on the collection (/things) declaring 201 whose response has an "id".
 */
function creatorFor(doc, ops, o, pathParams) {
  if (pathParams.length !== 1) return null;
  const idx = o.path.indexOf(`/{${pathParams[0].name}}`);
  if (idx <= 0) return null;
  const collection = o.path.slice(0, idx);
  const create = ops.find(x => x.method === 'POST' && x.path === collection && x.statuses.includes('201'));
  if (!create) return null;
  const resp = L.deref(doc, (create.op.responses || {})['201']) || {};
  const rs = resp.content && resp.content['application/json'] ? flatten(doc, resp.content['application/json'].schema || {}) : {};
  if (!rs.properties || !rs.properties.id) return null;
  const media = (L.deref(doc, create.op.requestBody) || {}).content || {};
  const bs = media['application/json'] && media['application/json'].schema;
  if (bs && !confident(doc, bs)) return null;
  const http = { method: 'POST', path: collection };
  if (create.op['x-idempotency'] !== 'exempt') http.headers = { 'Idempotency-Key': '{{$uuid:setup}}' };
  if (bs) http.body = sample(doc, bs);
  return { step: { id: 'setup', note: `creates the resource via ${create.operationId}`, http, capture: { rid: 'body.id' } }, param: pathParams[0].name };
}

function probesForOperation(doc, o, ops) {
  const out = [];
  const add = (title, http) => out.push({ title, http });
  const op = o.op;
  const params = new Map();
  for (const p of [...o.pathParams, ...(op.parameters || []).map(x => L.deref(doc, x))]) params.set(`${p.in}:${p.name}`, p);
  const all = [...params.values()];
  const pathParams = all.filter(p => p.in === 'path');
  const query = all.filter(p => p.in === 'query');
  const headers = all.filter(p => p.in === 'header');
  const media = (L.deref(doc, op.requestBody) || {}).content || {};
  const bodySchema = media['application/json'] && media['application/json'].schema ? flatten(doc, media['application/json'].schema) : null;
  const needsKey = o.method === 'POST' && op['x-idempotency'] !== 'exempt';
  const versioned = ['PUT', 'PATCH', 'DELETE'].includes(o.method);

  const creator = creatorFor(doc, ops, o, pathParams);
  let missingPath = o.path;
  for (const p of pathParams) missingPath = missingPath.split(`{${p.name}}`).join(idFor(doc, p));
  missingPath = missingPath.replace(/\{[^}]+\}/g, 'probe-nonexistent');
  // Probes target a real resource when the contract shows how to create one; otherwise a nonexistent id.
  const basePath = creator ? o.path.split(`{${creator.param}}`).join('{{rid}}') : missingPath;
  const baseHeaders = {};
  if (needsKey) baseHeaders['Idempotency-Key'] = '{{$uuid:key}}';
  for (const h of headers) {
    if (h.required && h.name.toLowerCase() !== 'idempotency-key') baseHeaders[h.name] = String(sample(doc, h.schema || {}));
  }
  if (versioned) baseHeaders['If-Match'] = '"v1"';
  const baseQuery = {};
  for (const q of query) if (q.required) baseQuery[q.name] = sample(doc, q.schema || {});
  const base = bodySchema ? sample(doc, bodySchema) : undefined;
  const req = over => {
    const r = { method: o.method, path: basePath };
    if (over.nonexistent) r.path = missingPath;
    const qs = over.query || baseQuery;
    if (Object.keys(qs).length) r.query = qs;
    const hs = over.headers || baseHeaders;
    if (Object.keys(hs).length) r.headers = hs;
    if (over.rawBody !== undefined) r.rawBody = over.rawBody;
    else if (over.body !== undefined) r.body = over.body;
    else if (base !== undefined && !over.noBody) r.body = base;
    if (over.path) r.path = over.path;
    return r;
  };
  if (pathParams.length && creator) add('baseline request on a nonexistent id: 404 (HTTP-9 step 8)', req({ nonexistent: true }));

  if (bodySchema) {
    add('valid baseline request', req({}));
    if (L.isPlainObject(base) && bodySchema.properties) {
      for (const k of bodySchema.required || []) {
        const b = { ...base };
        delete b[k];
        add(`missing required "${k}" (ERR-3)`, req({ body: b }));
      }
      for (const [k, raw] of Object.entries(bodySchema.properties)) {
        const ps = flatten(doc, raw);
        const t = typeOf(ps);
        const wrong = wrongTypeFor(t);
        if (wrong !== undefined) add(`wrong type for "${k}" (ERR-3)`, req({ body: { ...base, [k]: wrong } }));
        if (!nullable(ps)) add(`null for non-nullable "${k}" (ERR-3)`, req({ body: { ...base, [k]: null } }));
        if (t === 'string') {
          if (ps.maxLength !== undefined) {
            add(`"${k}" exactly maxLength ${ps.maxLength}`, req({ body: { ...base, [k]: 'x'.repeat(ps.maxLength) } }));
            add(`"${k}" maxLength+1`, req({ body: { ...base, [k]: 'x'.repeat(ps.maxLength + 1) } }));
            add(`"${k}" maxLength counted in astral code points (SER-9)`, req({ body: { ...base, [k]: '😀'.repeat(ps.maxLength) } }));
          }
          if (ps.minLength) add(`"${k}" minLength-1`, req({ body: { ...base, [k]: 'x'.repeat(ps.minLength - 1) } }));
          const n = [...ROUND_TRIP].length;
          if (!ps.format && !ps.pattern && !ps.enum && (ps.maxLength ?? n) >= n && (ps.minLength || 0) <= n) {
            add(`"${k}" with surrounding whitespace and non-ASCII round-trips unchanged (SER-9)`, req({ body: { ...base, [k]: ROUND_TRIP } }));
            if ((ps.maxLength ?? 99) >= [...NFD_SAMPLE.normalize('NFC')].length) add(`"${k}" in NFD form is normalized to NFC (SER-9)`, req({ body: { ...base, [k]: NFD_SAMPLE } }));
            if (ps.maxLength !== undefined) add(`"${k}" maxLength counted after NFC normalization (SER-9)`, req({ body: { ...base, [k]: 'e\u0301'.repeat(ps.maxLength) } }));
          }
          if (ps.format === 'uuid') add(`"${k}" malformed uuid (ERR-3 format)`, req({ body: { ...base, [k]: 'not-a-uuid' } }));
        }
        if (t === 'integer' || t === 'number') {
          if (ps.maximum !== undefined) add(`"${k}" = maximum+1`, req({ body: { ...base, [k]: ps.maximum + 1 } }));
          if (ps.minimum !== undefined) add(`"${k}" = minimum-1`, req({ body: { ...base, [k]: ps.minimum - 1 } }));
          if (t === 'integer') add(`"${k}" non-integer number`, req({ body: { ...base, [k]: 1.5 } }));
        }
        if (Array.isArray(ps.enum)) add(`"${k}" not in enum`, req({ body: { ...base, [k]: '__probe_invalid__' } }));
      }
      add('unknown extra property (SER-8)', req({ body: { ...base, probe_unknown_field: 1 } }));
      if ((bodySchema.required || []).length) {
        const b = { ...base, probe_unknown_field: 1 };
        delete b[bodySchema.required[0]];
        add('two violations at once: errors[] content and order (ERR-3)', req({ body: b }));
      }
    }
    add('empty body with JSON content type (HTTP-3)', req({ rawBody: '', headers: { ...baseHeaders, 'Content-Type': 'application/json' } }));
    add('malformed JSON (HTTP-9 step 5)', req({ rawBody: '{', headers: { ...baseHeaders, 'Content-Type': 'application/json' } }));
    add('non-JSON content type (HTTP-3)', req({ rawBody: 'probe', headers: { ...baseHeaders, 'Content-Type': 'text/plain' } }));
    add('malformed body AND wrong content type: precedence (HTTP-9)', req({ rawBody: '{', headers: { ...baseHeaders, 'Content-Type': 'text/plain' } }));
  } else if (['POST', 'PUT', 'PATCH'].includes(o.method)) {
    add('baseline request without body', req({ noBody: true }));
    add('stray body with non-JSON content type on a body-less operation (HTTP-3)', req({ rawBody: 'probe', headers: { ...baseHeaders, 'Content-Type': 'text/plain' } }));
  } else {
    add('baseline request', req({}));
  }

  if (needsKey) {
    const h = { ...baseHeaders };
    delete h['Idempotency-Key'];
    add('missing Idempotency-Key (IDEM-1)', req({ headers: h }));
    add('malformed Idempotency-Key (IDEM-1)', req({ headers: { ...baseHeaders, 'Idempotency-Key': 'not-a-uuid' } }));
    add('empty Idempotency-Key is treated as absent (HTTP-11)', req({ headers: { ...baseHeaders, 'Idempotency-Key': '' } }));
    if (bodySchema && (bodySchema.required || []).length) {
      const b = { ...(L.isPlainObject(base) ? base : {}) };
      delete b[bodySchema.required[0]];
      add('missing Idempotency-Key AND invalid body: one errors[] (HTTP-9 step 6)', req({ headers: h, body: b }));
    }
  }
  if (versioned) {
    const h = { ...baseHeaders };
    delete h['If-Match'];
    add('missing If-Match on a nonexistent resource: 404 before 428 (HTTP-9)', req({ headers: h, nonexistent: true }));
    if (creator) add('missing If-Match on an existing resource: 428 (OCC-3)', req({ headers: h }));
    add('empty If-Match is treated as absent (HTTP-11)', req({ headers: { ...baseHeaders, 'If-Match': '' } }));
    add('weak If-Match tag (OCC-3)', req({ headers: { ...baseHeaders, 'If-Match': 'W/"v1"' } }));
    add('If-Match: * (OCC-3)', req({ headers: { ...baseHeaders, 'If-Match': '*' } }));
  }
  for (const q of query) {
    const qs = flatten(doc, q.schema || {});
    if (q.name === 'limit') {
      for (const v of [0, 1, 100, 101, 'abc']) add(`limit=${v} (PAGE-1)`, req({ query: { ...baseQuery, limit: v } }));
    } else if (q.name === 'cursor') {
      add('invalid cursor (PAGE-1)', req({ query: { ...baseQuery, cursor: '!!not-a-cursor!!' } }));
    } else {
      const t = typeOf(qs);
      if (t === 'integer' || t === 'number') add(`query "${q.name}" not a number`, req({ query: { ...baseQuery, [q.name]: 'abc' } }));
      if (Array.isArray(qs.enum)) add(`query "${q.name}" not in enum`, req({ query: { ...baseQuery, [q.name]: '__probe_invalid__' } }));
      if (t === 'boolean') add(`query "${q.name}" not a boolean`, req({ query: { ...baseQuery, [q.name]: 'maybe' } }));
    }
  }
  add('unknown query parameter (SER-8)', req({ query: { ...baseQuery, probe_unknown: '1' } }));
  if (pathParams.length) {
    let bad = o.path;
    for (const p of pathParams) bad = bad.split(`{${p.name}}`).join('not-a-valid-id');
    add('malformed path id: 404 (HTTP-9 step 8)', req({ path: bad }));
  }
  return out;
}

/** Generate the probe case file for every operation, deterministically ordered. */
function generateProbes(doc, ops) {
  const sorted = [...ops].sort((a, b) => (a.path === b.path ? METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method) : a.path < b.path ? -1 : 1));
  const items = [];
  for (const o of sorted) {
    const creator = creatorFor(doc, ops, o, [...o.pathParams, ...((o.op.parameters || []).map(x => L.deref(doc, x)))].filter(p => p.in === 'path'));
    for (const p of probesForOperation(doc, o, ops)) {
      const usesRid = JSON.stringify(p.http).includes('{{rid}}');
      items.push({ op: o.operationId || `${o.method} ${o.path}`, title: p.title, steps: usesRid && creator ? [creator.step, { http: p.http }] : [{ http: p.http }] });
    }
  }
  // Per path: trailing slash (HTTP-4) and one undeclared method (HTTP-5).
  const byPath = new Map();
  for (const o of sorted) {
    if (!byPath.has(o.path)) byPath.set(o.path, []);
    byPath.get(o.path).push(o.method);
  }
  for (const [p, methods] of byPath) {
    const concrete = p.replace(/\{[^}]+\}/g, NONEXISTENT_UUID);
    if (methods.includes('GET')) items.push({ op: p, title: 'trailing slash variant: 404 (HTTP-4)', steps: [{ http: { method: 'GET', path: `${concrete}/` } }] });
    const undeclared = ['PUT', 'DELETE', 'PATCH', 'POST', 'GET'].find(m => !methods.includes(m));
    if (undeclared) items.push({ op: p, title: `undeclared method ${undeclared}: 405 + Allow (HTTP-5)`, steps: [{ http: { method: undeclared, path: concrete } }] });
  }
  return items.map((it, i) => ({
    id: `GEN-${String(i + 1).padStart(3, '0')}`,
    title: `${it.op}: ${it.title}`,
    probe: true,
    tags: ['generated', it.op],
    steps: it.steps,
  }));
}

module.exports = { generateProbes, sample, flatten };
