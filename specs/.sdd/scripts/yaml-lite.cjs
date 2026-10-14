'use strict';
/**
 * yaml-lite.cjs — dependency-free parser for the YAML subset that API contracts use:
 * block mappings and sequences (including compact "- key: value" items), plain and quoted
 * scalars (multi-line too), flow collections ({...} / [...]), block scalars (| and >, with
 * chomping), and comments. Anchors, aliases, tags, complex keys and multi-document streams
 * are rejected with a clear error rather than misparsed. Scalars follow the YAML 1.2 core
 * schema (null, booleans, numbers).
 *
 * Determinism over leniency: plain scalars that YAML 1.1 and YAML 1.2 parsers read differently
 * (yes/no/on/off, 1_000, 0755, 1:30, unquoted dates) are rejected — quote them — so a contract
 * means the same thing to every tool and every builder.
 */

class YamlError extends Error {
  constructor(msg, line) {
    super(line ? `YAML line ${line}: ${msg}` : `YAML: ${msg}`);
  }
}

/** A quote opens a quoted scalar only at the start of a value token, never in the middle of a plain scalar. */
function opensScalar(s, i) {
  let j = i - 1;
  while (j >= 0 && s[j] === ' ') j--;
  if (j < 0) return true;
  const p = s[j];
  if ('[{,'.includes(p)) return true;
  if ((p === ':' || p === '-' || p === '?') && j < i - 1 && (j === 0 || /\s|[[{,]/.test(s[j - 1]) || p === ':')) return true;
  return false;
}

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') { i++; continue; }
      if (c === q) {
        if (q === "'" && s[i + 1] === "'") { i++; continue; }
        q = null;
      }
      continue;
    }
    if ((c === '"' || c === "'") && opensScalar(s, i)) { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).replace(/\s+$/, '');
  }
  return s.replace(/\s+$/, '');
}

const AMBIGUOUS = [
  [/^(y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/, 'a YAML 1.1 boolean'],
  [/^[-+]?(0|[1-9][0-9_]*)(\.[0-9_]*)?$/, null], // plain number: checked below for underscores
  [/^[-+]?0[0-9]+$/, 'a leading-zero (octal in YAML 1.1) number'],
  [/^[-+]?[0-9]+(:[0-5]?[0-9])+(\.[0-9]*)?$/, 'a YAML 1.1 sexagesimal number'],
  [/^\d{4}-\d{1,2}-\d{1,2}([Tt ]|$)/, 'a date/timestamp (a Date in YAML 1.1 parsers)'],
];

/** Plain keys that YAML 1.1 parsers turn into booleans or odd numbers must be quoted. */
function checkKey(key, line) {
  for (const [re, what] of AMBIGUOUS) {
    if (re.test(key) && (what || key.includes('_'))) throw new YamlError(`ambiguous plain key "${key}" (${what || 'underscore digits'}); quote it`, line);
  }
}

function scalar(s, line) {
  const t = s.trim();
  for (const [re, what] of AMBIGUOUS) {
    if (!re.test(t)) continue;
    if (what) throw new YamlError(`ambiguous plain scalar "${t}" is ${what}; quote it`, line);
    if (t.includes('_')) throw new YamlError(`ambiguous plain scalar "${t}" (underscore digit separators differ between YAML versions); quote it or remove the underscores`, line);
  }
  if (t === '-') throw new YamlError('a lone "-" is not a valid value', line);
  if (/:(\s|$)/.test(t)) throw new YamlError(`plain scalar "${t.slice(0, 40)}" contains ": " (mapping values are not allowed here); quote it`, line);
  if (t === '' || t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null;
  if (t === 'true' || t === 'True' || t === 'TRUE') return true;
  if (t === 'false' || t === 'False' || t === 'FALSE') return false;
  if (/^[-+]?\d+$/.test(t)) return Number(t);
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t.slice(2), 16);
  if (/^0o[0-7]+$/.test(t)) return parseInt(t.slice(2), 8);
  if (/^[-+]?(\.\d+|\d+(\.\d*)?)([eE][-+]?\d+)?$/.test(t)) return Number(t);
  if (/^[-+]?\.(inf|Inf|INF)$/.test(t)) return t[0] === '-' ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(t)) return NaN;
  if (t[0] === '&' || t[0] === '*' || t[0] === '!') throw new YamlError(`anchors, aliases and tags are not supported ("${t.slice(0, 20)}")`, line);
  if (t[0] === '%' || t[0] === '@' || t[0] === '`') throw new YamlError(`plain scalar cannot start with "${t[0]}"`, line);
  return t;
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', 0: '\0', b: '\b', f: '\f', e: '\x1b', ' ': ' ', N: '\u0085', _: ' ', L: ' ', P: ' ', a: '\x07', v: '\v' };

/** Parse a quoted scalar starting at pos. Returns { value, end } or null if unterminated. */
function parseQuoted(s, pos) {
  const q = s[pos];
  let i = pos + 1;
  let out = '';
  while (i < s.length) {
    const c = s[i];
    if (q === "'") {
      if (c === "'") {
        if (s[i + 1] === "'") { out += "'"; i += 2; continue; }
        return { value: out, end: i + 1 };
      }
      out += c;
      i++;
      continue;
    }
    if (c === '\\') {
      const e = s[i + 1];
      if (e === undefined) return null; // escaped line break: continues on the next line
      if (e === 'x' || e === 'u' || e === 'U') {
        const n = { x: 2, u: 4, U: 8 }[e];
        out += String.fromCodePoint(parseInt(s.slice(i + 2, i + 2 + n), 16));
        i += 2 + n;
        continue;
      }
      if (!(e in ESCAPES)) throw new YamlError(`unknown escape "\\${e}"`);
      out += ESCAPES[e];
      i += 2;
      continue;
    }
    if (c === '"') return { value: out, end: i + 1 };
    out += c;
    i++;
  }
  return null;
}

/** Split "key: rest". Returns { key, rest } or null when the content is not a mapping entry. */
function splitKey(content, line) {
  if (content.startsWith('? ') || content === '?') throw new YamlError('complex keys ("? ") are not supported', line);
  if (content[0] === '"' || content[0] === "'") {
    const q = parseQuoted(content, 0);
    if (!q) return null;
    const after = content.slice(q.end);
    const m = after.match(/^\s*:(\s|$)/);
    if (!m) return null;
    return { key: q.value, rest: after.slice(m[0].length).trim() };
  }
  if (content[0] === '[' || content[0] === '{') return null;
  const m = content.match(/:(\s|$)/);
  if (!m) return null;
  const key = content.slice(0, m.index).trim();
  if (key === '' || key === '<<') throw new YamlError(key === '' ? 'empty key' : 'merge keys ("<<") are not supported', line);
  checkKey(key, line);
  if (/^[&*!]/.test(key)) throw new YamlError('anchors, aliases and tags are not supported', line);
  return { key, rest: content.slice(m.index + 1).trim() };
}

function isSeqItem(c) {
  return c === '-' || c.startsWith('- ');
}

class FlowParser {
  constructor(s, line) { this.s = s; this.i = 0; this.line = line; }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  value() {
    this.ws();
    const c = this.s[this.i];
    if (c === '[') return this.seq();
    if (c === '{') return this.map();
    if (c === '"' || c === "'") {
      const q = parseQuoted(this.s, this.i);
      if (!q) throw new YamlError('unterminated quoted string in flow collection', this.line);
      this.i = q.end;
      return q.value;
    }
    const start = this.i;
    while (this.i < this.s.length && !',]}'.includes(this.s[this.i])) this.i++;
    return scalar(this.s.slice(start, this.i), this.line);
  }
  seq() {
    const out = [];
    this.i++;
    for (;;) {
      this.ws();
      if (this.s[this.i] === ']') { this.i++; return out; }
      out.push(this.value());
      this.ws();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === ']') { this.i++; return out; }
      throw new YamlError('expected "," or "]" in flow sequence', this.line);
    }
  }
  map() {
    const out = {};
    this.i++;
    for (;;) {
      this.ws();
      if (this.s[this.i] === '}') { this.i++; return out; }
      let key;
      if (this.s[this.i] === '"' || this.s[this.i] === "'") {
        const q = parseQuoted(this.s, this.i);
        if (!q) throw new YamlError('unterminated quoted key', this.line);
        key = q.value;
        this.i = q.end;
      } else {
        const start = this.i;
        while (this.i < this.s.length && !',}'.includes(this.s[this.i]) && !(this.s[this.i] === ':' && /[\s,}\]]|^$/.test(this.s[this.i + 1] || ''))) this.i++;
        key = this.s.slice(start, this.i).trim();
      }
      this.ws();
      let val = null;
      if (this.s[this.i] === ':') { this.i++; val = this.value(); }
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(`duplicate key "${key}"`, this.line);
      out[key] = val;
      this.ws();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === '}') { this.i++; return out; }
      throw new YamlError('expected "," or "}" in flow mapping', this.line);
    }
  }
}

function flowBalanced(s) {
  let depth = 0;
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') { i++; continue; }
      if (c === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } q = null; }
      continue;
    }
    if (c === '"' || c === "'") q = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
  }
  return depth <= 0 && !q;
}

class Parser {
  constructor(text) {
    this.raw = text.replace(/^﻿/, '').split(/\r?\n/);
    this.i = 0;
    this.override = new Map();
  }

  info(idx) {
    if (this.override.has(idx)) return this.override.get(idx);
    const raw = this.raw[idx];
    const lead = raw.match(/^[ \t]*/)[0];
    const content = stripComment(raw.slice(lead.length));
    if (content === '') return null;
    if (lead.includes('\t')) throw new YamlError('tabs are not allowed in indentation', idx + 1);
    return { indent: lead.length, content, no: idx + 1 };
  }

  peek() {
    while (this.i < this.raw.length) {
      const l = this.info(this.i);
      if (l) return l;
      this.i++;
    }
    return null;
  }

  consume() { this.i++; }

  parseDocument() {
    let l = this.peek();
    if (!l) return null;
    if (l.content.startsWith('%')) throw new YamlError('directives are not supported', l.no);
    if (l.indent === 0 && (l.content === '---' || l.content.startsWith('--- '))) {
      if (l.content !== '---') throw new YamlError('content after "---" is not supported', l.no);
      this.consume();
      l = this.peek();
      if (!l) return null;
    }
    const value = this.parseBlock(l.indent);
    const rest = this.peek();
    if (rest) {
      if (rest.indent === 0 && rest.content === '---') throw new YamlError('multi-document streams are not supported', rest.no);
      if (!(rest.indent === 0 && rest.content === '...')) throw new YamlError(`unexpected content "${rest.content.slice(0, 40)}"`, rest.no);
    }
    return value;
  }

  parseBlock(indent) {
    const l = this.peek();
    if (!l || l.indent < indent) return null;
    if (isSeqItem(l.content)) return this.parseSeq(l.indent);
    if (splitKey(l.content, l.no)) return this.parseMap(l.indent);
    this.consume();
    return this.parseValue(l.content, indent - 1, l);
  }

  parseMap(indent) {
    const obj = {};
    for (;;) {
      const l = this.peek();
      if (!l || l.indent < indent) break;
      if (l.indent > indent) throw new YamlError(`unexpected indentation (expected ${indent} spaces)`, l.no);
      if (isSeqItem(l.content)) break;
      const kv = splitKey(l.content, l.no);
      if (!kv) throw new YamlError(`expected "key: value", got "${l.content.slice(0, 40)}"`, l.no);
      this.consume();
      if (Object.prototype.hasOwnProperty.call(obj, kv.key)) throw new YamlError(`duplicate key "${kv.key}"`, l.no);
      obj[kv.key] = this.parseValue(kv.rest, indent, l);
    }
    return obj;
  }

  parseSeq(indent) {
    const arr = [];
    for (;;) {
      const l = this.peek();
      if (!l || l.indent < indent) break;
      if (l.indent > indent) throw new YamlError(`unexpected indentation (expected ${indent} spaces)`, l.no);
      if (!isSeqItem(l.content)) break;
      const after = l.content === '-' ? '' : l.content.slice(2);
      const item = after.trimStart();
      const offset = 2 + (after.length - item.length);
      if (item === '') {
        this.consume();
        const n = this.peek();
        arr.push(n && n.indent > indent ? this.parseBlock(n.indent) : null);
        continue;
      }
      if (isSeqItem(item) || (splitKey(item, l.no) && item[0] !== '[' && item[0] !== '{')) {
        // "- key: value" or "- - x": the item is a block collection starting at the item's column.
        this.override.set(this.i, { indent: indent + offset, content: item, no: l.no });
        arr.push(this.parseBlock(indent + offset));
        continue;
      }
      this.consume();
      arr.push(this.parseValue(item, indent, l));
    }
    return arr;
  }

  parseValue(rest, parentIndent, line) {
    if (rest === '') {
      const n = this.peek();
      if (!n) return null;
      if (n.indent > parentIndent) return this.parseBlock(n.indent);
      if (n.indent === parentIndent && isSeqItem(n.content)) return this.parseSeq(n.indent);
      return null;
    }
    if (rest[0] === '|' || rest[0] === '>') return this.parseBlockScalar(rest, parentIndent, line);
    if (rest[0] === '&' || rest[0] === '*' || rest[0] === '!') throw new YamlError('anchors, aliases and tags are not supported', line.no);
    if (rest[0] === '[' || rest[0] === '{') {
      let text = rest;
      while (!flowBalanced(text)) {
        const n = this.peek();
        if (!n) throw new YamlError('unterminated flow collection', line.no);
        text += ' ' + n.content.trim();
        this.consume();
      }
      const fp = new FlowParser(text, line.no);
      const v = fp.value();
      fp.ws();
      if (fp.i < text.length) throw new YamlError(`unexpected content after flow collection: "${text.slice(fp.i, fp.i + 20)}"`, line.no);
      return v;
    }
    if (rest[0] === '"' || rest[0] === "'") {
      let text = rest;
      let q = parseQuoted(text, 0);
      while (!q) {
        // Multi-line quoted scalar: line breaks fold to spaces (blank lines to "\n").
        if (this.i >= this.raw.length) throw new YamlError('unterminated quoted string', line.no);
        const next = this.raw[this.i].trim();
        const trailingBackslashes = text.match(/\\*$/)[0].length;
        if (text[0] === '"' && trailingBackslashes % 2 === 1) text = text.slice(0, -1) + next; // "\" + line break joins lines
        else text += next === '' ? '\n' : (text.endsWith('\n') ? '' : ' ') + next;
        this.consume();
        q = parseQuoted(text, 0);
      }
      if (text.slice(q.end).trim()) throw new YamlError(`unexpected content after quoted string: "${text.slice(q.end).trim().slice(0, 20)}"`, line.no);
      return q.value;
    }
    // Plain scalar, possibly continued on more-indented lines: line breaks fold to spaces,
    // each blank line in between becomes "\n".
    let text = rest;
    for (;;) {
      const before = this.i;
      const n = this.peek();
      if (!n || n.indent <= parentIndent) break;
      let blanks = 0;
      for (let k = before; k < this.i; k++) if (this.raw[k].trim() === '') blanks++;
      text += blanks ? '\n'.repeat(blanks) + n.content.trim() : ' ' + n.content.trim();
      this.consume();
    }
    if (!text.includes('\n')) return scalar(text, line.no);
    for (const part of text.split('\n')) if (/:(\s|$)/.test(part.trim())) throw new YamlError(`plain scalar "${part.trim().slice(0, 40)}" contains ": "; quote it`, line.no);
    return text; // a multi-line plain scalar is always a string
  }

  parseBlockScalar(header, parentIndent, line) {
    const m = header.match(/^([|>])([+-]?)([1-9]?)([+-]?)$/);
    if (!m) throw new YamlError(`invalid block scalar header "${header}"`, line.no);
    const literal = m[1] === '|';
    const chomp = m[2] || m[4] || '';
    const explicit = m[3] ? Number(m[3]) : 0;
    let blockIndent = explicit ? parentIndent + explicit : 0;
    const lines = [];
    while (this.i < this.raw.length) {
      const raw = this.raw[this.i];
      if (raw.trim() === '') {
        // Spaces beyond the block indentation on an otherwise blank line are content.
        lines.push(blockIndent && raw.length > blockIndent && !raw.includes('\t') ? raw.slice(blockIndent) : '');
        this.i++;
        continue;
      }
      const ind = raw.match(/^ */)[0].length;
      if (!blockIndent) {
        if (ind <= parentIndent) break;
        blockIndent = ind;
      }
      if (ind < blockIndent) break;
      lines.push(raw.slice(blockIndent));
      this.i++;
    }
    let trailing = 0;
    while (lines.length && lines[lines.length - 1].trim() === '') { lines.pop(); trailing++; }
    let body;
    if (literal) body = lines.join('\n');
    else {
      body = '';
      for (let k = 0; k < lines.length; k++) {
        const cur = lines[k];
        if (k === 0) { body = cur; continue; }
        const prev = lines[k - 1];
        const moreIndented = /^\s/.test(cur) || /^\s/.test(prev);
        if (cur === '') body += '\n';
        else if (prev === '' || moreIndented) body += (prev === '' ? '' : '\n') + cur;
        else body += ' ' + cur;
      }
    }
    if (!lines.length) return chomp === '+' ? '\n'.repeat(trailing) : '';
    if (chomp === '-') return body;
    if (chomp === '+') return body + '\n' + '\n'.repeat(trailing);
    return body + '\n';
  }
}

function parseYaml(text) {
  return new Parser(text).parseDocument();
}

module.exports = { parseYaml, YamlError };
