/*
 * Program model, RSLogix 500 text (mnemonic) format, and compiler.
 *
 * Model:
 *   project  = { profileId, files: [ {num, name, rungs:[Rung]} ], desc: {addr: text}, data }
 *   Rung     = { comment, items: Series }
 *   Series   = [Node]
 *   Node     = { t:'I', mn, ops:[string] }        instruction
 *            | { t:'B', legs:[Series, Series…] }  parallel branch
 *
 * Text format (as RSLogix 500 shows it in its ASCII rung editor):
 *   SOR XIC I:0/0 BST XIC O:0/0 NXB XIC B3:0/0 BND XIO I:0/1 OTE O:0/0 EOR
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  class ParseError extends Error {}

  // ---------------- text → model ----------------
  function tokenize(text) {
    return String(text).replace(/[\r\n\t,]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  }

  // Parse one rung. Returns { items }.
  function parseRung(text, profile) {
    const tok = tokenize(text);
    let i = 0;
    if (tok[0] && tok[0].toUpperCase() === 'SOR') i++;
    let end = tok.length;
    if (end > i && tok[end - 1].toUpperCase() === 'EOR') end--;

    function series(inBranch) {
      const out = [];
      while (i < end) {
        const t = tok[i].toUpperCase();
        if (t === 'NXB' || t === 'BND') {
          if (!inBranch) throw new ParseError(`${t} without a matching BST`);
          return out;
        }
        if (t === 'SOR' || t === 'EOR') throw new ParseError(`Unexpected ${t} in the middle of a rung`);
        i++;
        if (t === 'BST') {
          const legs = [series(true)];
          while (i < end && tok[i].toUpperCase() === 'NXB') { i++; legs.push(series(true)); }
          if (i >= end || tok[i].toUpperCase() !== 'BND') throw new ParseError('BST without a matching BND');
          i++;
          if (legs.length < 2) throw new ParseError('A branch needs at least two legs (BST … NXB … BND)');
          out.push({ t: 'B', legs });
          continue;
        }
        const sp = PLC.spec(t, profile);
        if (!sp) throw new ParseError(`Unknown instruction "${tok[i - 1]}"`);
        const n = sp.ops.length;
        if (i + n > end) throw new ParseError(`${t} needs ${n} operand${n === 1 ? '' : 's'}: ${sp.ops.map((o) => o[0]).join(', ')}`);
        const ops = tok.slice(i, i + n);
        for (const o of ops) {
          if (['BST', 'NXB', 'BND', 'SOR', 'EOR'].includes(o.toUpperCase()) || (PLC.INSTR[o.toUpperCase()] && !/[:#]/.test(o)))
            throw new ParseError(`${t} needs ${n} operand${n === 1 ? '' : 's'} (${sp.ops.map((o) => o[0]).join(', ')}) but found "${o}"`);
        }
        i += n;
        out.push({ t: 'I', mn: sp.display || sp.mn, ops });
      }
      if (inBranch) throw new ParseError('BST without a matching BND');
      return out;
    }
    const items = series(false);
    return { comment: '', items };
  }

  // Parse several rungs: one per line, or separated by EOR.
  function parseRungs(text, profile) {
    const chunks = String(text)
      .split(/\bEOR\b|\n/i)
      .map((s) => s.trim())
      .filter((s) => s && s.toUpperCase() !== 'SOR');
    return chunks.map((c) => parseRung(c, profile));
  }

  // ---------------- model → text ----------------
  function seriesText(series, live) {
    const out = [];
    for (const n of series) {
      if (n.t === 'B') {
        out.push('BST');
        n.legs.forEach((leg, k) => {
          if (k) out.push('NXB');
          const s = seriesText(leg, live);
          if (s) out.push(s);
        });
        out.push('BND');
      } else {
        out.push(n.mn);
        const ops = live ? live(n) : n.ops;
        if (ops.length) out.push(ops.join(' '));
      }
    }
    return out.join(' ');
  }
  function rungText(rung, live) {
    const body = seriesText(rung.items, live);
    return body ? `SOR ${body} EOR` : 'SOR EOR';
  }

  // Operands with PRE/ACC/LEN/POS read back from the data table.
  function liveOps(dt, profile) {
    return function (n) {
      const sp = PLC.spec(n.mn, profile);
      if (!sp || !dt) return n.ops;
      const elemIdx = sp.ops.findIndex((o) => ['tmr', 'ctr', 'ctl'].includes(o[1]));
      if (elemIdx < 0) return n.ops;
      const r = dt.tryParse(n.ops[elemIdx]);
      if (!r || r.kind !== 'elem') return n.ops;
      const d = dt.file(r.file).data;
      return n.ops.map((v, k) => {
        const ty = sp.ops[k][1];
        if (ty === 'pre' || ty === 'len') return String(d[r.elem * 3 + 1]);
        if (ty === 'acc' || ty === 'pos') return String(d[r.elem * 3 + 2]);
        return v;
      });
    };
  }

  // ---------------- walking ----------------
  function walkSeries(series, fn, path) {
    series.forEach((n, i) => {
      const p = path.concat(i);
      fn(n, p);
      if (n.t === 'B') n.legs.forEach((leg, k) => walkSeries(leg, fn, p.concat('L' + k)));
    });
  }
  function forEachInstr(project, fn) {
    for (const f of project.files)
      f.rungs.forEach((r, ri) => walkSeries(r.items, (n, p) => { if (n.t === 'I') fn(n, f, ri, p); }, []));
  }

  // ---------------- operand compile ----------------
  function compileOperand(dt, profile, type, raw, project) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text || text === '?') throw new PLC.AddrError('Operand missing');
    const constOnly = (lo, hi, what) => {
      const v = PLC.parseConst(text);
      if (v === null || !Number.isInteger(v)) throw new PLC.AddrError(`${what} must be a whole number`);
      if (v < lo || v > hi) throw new PLC.AddrError(`${what} must be ${lo}–${hi}`);
      return { kind: 'const', value: v, text: String(v) };
    };
    switch (type) {
      case 'bit': {
        const r = dt.parse(text);
        if (r.kind !== 'bit') throw new PLC.AddrError(`"${text}" is a word — this needs a bit, e.g. ${r.text}/0`);
        return r;
      }
      case 'tmr': case 'ctr': case 'ctl': case 'res': {
        const r = dt.parse(text);
        const want = { tmr: ['T'], ctr: ['C'], ctl: ['R'], res: ['T', 'C', 'R'] }[type];
        const ft = dt.file(r.file).type;
        if (r.kind !== 'elem' || !want.includes(ft))
          throw new PLC.AddrError(`"${text}" must be a ${want.map((w) => PLC.TYPE_NAMES[w].toLowerCase()).join('/')} element, e.g. ${want[0]}${{ T: 4, C: 5, R: 6 }[want[0]]}:0`);
        return r;
      }
      case 'src': case 'mask': {
        const c = PLC.parseConst(text);
        if (c !== null) {
          if (!Number.isInteger(c) && !profile.float) throw new PLC.AddrError('This controller has no floating-point math — use a whole number');
          if (Number.isInteger(c) && (c < -32768 || c > 65535)) throw new PLC.AddrError('Constant must fit in 16 bits (-32768 to 32767)');
          return { kind: 'const', value: Number.isInteger(c) ? PLC.toInt16(c) : c, text: Number.isInteger(c) ? String(PLC.toInt16(c)) : String(c) };
        }
        const r = dt.parse(text);
        if (r.kind !== 'word' && r.kind !== 'float') throw new PLC.AddrError(`"${text}" must be a word address (like N7:0) or a number`);
        return r;
      }
      case 'dst': {
        const r = dt.parse(text);
        if (r.kind !== 'word' && r.kind !== 'float') throw new PLC.AddrError(`"${text}" must be a word address like N7:0`);
        if (dt.file(r.file).type === 'I') throw new PLC.AddrError(`${r.text}: don't write to the input image — the next input scan overwrites it`);
        return r;
      }
      case 'tb': {
        const v = parseFloat(text);
        if (!profile.timeBases.some((b) => Math.abs(b - v) < 1e-9))
          throw new PLC.AddrError(`Time base must be ${profile.timeBases.map((b) => b.toFixed(b < 0.01 ? 3 : b < 1 ? 2 : 1)).join(' or ')} on this controller`);
        return { kind: 'const', value: v, text: v < 0.01 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : v.toFixed(1) };
      }
      case 'pre': case 'acc': return constOnly(-32768, 32767, type === 'pre' ? 'Preset' : 'Accum');
      case 'len': return constOnly(0, 32767, 'Length');
      case 'pos': return constOnly(0, 32767, 'Position');
      case 'file': {
        if (!text.startsWith('#')) throw new PLC.AddrError(`"${text}" must be a file address starting with #, e.g. #N7:10`);
        return dt.parse(text);
      }
      case 'lbl': {
        const m = /^(?:Q2:)?(\d+)$/i.exec(text);
        if (!m) throw new PLC.AddrError('Label must be a number like Q2:0 (or just 0)');
        const v = parseInt(m[1], 10);
        if (v > 999) throw new PLC.AddrError('Label must be 0–999');
        return { kind: 'const', value: v, text: `Q2:${v}` };
      }
      case 'pf': {
        const m = /^(?:U:)?(\d+)$/i.exec(text);
        if (!m) throw new PLC.AddrError('Subroutine file must be like U:3');
        const v = parseInt(m[1], 10);
        if (v < 3 || v > profile.maxProgFile) throw new PLC.AddrError(`Subroutine file must be U:3 to U:${profile.maxProgFile}`);
        if (project && !project.files.some((f) => f.num === v)) throw new PLC.AddrError(`Program file ${v} doesn't exist — add LAD ${v} first`);
        return { kind: 'const', value: v, text: `U:${v}` };
      }
    }
    throw new PLC.AddrError('Unknown operand type ' + type);
  }

  // Write PRE/ACC/LEN/POS operand values into the data table (done when a
  // rung is edited or imported, like accepting an edit in RSLogix).
  function applyInitialValues(dt, profile, node) {
    const sp = PLC.spec(node.mn, profile);
    if (!sp) return;
    const ei = sp.ops.findIndex((o) => ['tmr', 'ctr', 'ctl'].includes(o[1]));
    if (ei < 0) return;
    const r = dt.tryParse(node.ops[ei]);
    if (!r || r.kind !== 'elem') return;
    const d = dt.file(r.file).data;
    sp.ops.forEach((o, k) => {
      const v = PLC.parseConst(String(node.ops[k] || ''));
      if (v === null || !Number.isInteger(v)) return;
      if (o[1] === 'pre' || o[1] === 'len') d[r.elem * 3 + 1] = v;
      if (o[1] === 'acc' || o[1] === 'pos') d[r.elem * 3 + 2] = v;
    });
  }

  // ---------------- compile ----------------
  // Returns { ok, errors:[{file, rung, path, node, msg}], files: Map(num → [compiledRung]),
  //           labels: Map(num → Map(label → rungIndex)), recs: Map(node → rec) }
  function compile(project, dt, profile) {
    const errors = [];
    const recs = new Map();
    const files = new Map();
    const labels = new Map();

    for (const f of project.files) {
      const crungs = [];
      const lbl = new Map();
      f.rungs.forEach((rung, ri) => {
        const err = (node, path, msg) => errors.push({ file: f.num, rung: ri, path, node, msg });
        let count = 0;
        function cseries(series, path, isTop) {
          const out = [];
          series.forEach((n, i) => {
            const p = path.concat(i);
            if (n.t === 'B') {
              if (n.legs.length < 2) err(n, p, 'Branch needs at least two legs');
              out.push({ t: 'B', node: n, legs: n.legs.map((leg, k) => cseries(leg, p.concat('L' + k), false)) });
              recs.set(n, { rcIn: false, rcOut: false });
              return;
            }
            const sp = PLC.spec(n.mn, profile);
            if (!sp) { err(n, p, `Unknown instruction ${n.mn}`); return; }
            if (!PLC.allowed(sp.mn === 'OSR_ML' ? 'OSR' : sp.mn, profile)) { err(n, p, `${n.mn} is not available on ${profile.short}`); return; }
            const refs = [];
            sp.ops.forEach((o, k) => {
              try {
                const r = compileOperand(dt, profile, o[1], n.ops[k], project);
                refs.push(r);
                if (r.text && n.ops[k] !== r.text && !['pre', 'acc', 'len', 'pos'].includes(o[1])) n.ops[k] = r.text; // canonicalise
              } catch (e) {
                refs.push(null);
                err(n, p, `${n.mn} ${o[0]}: ${e.message}`);
              }
            });
            if (sp.mn === 'LBL') {
              if (!(isTop && i === 0 && path.length === 0)) err(n, p, 'LBL must be the first instruction on the rung');
              else if (refs[0]) {
                if (lbl.has(refs[0].value)) err(n, p, `Label ${refs[0].text} is used twice in this file`);
                lbl.set(refs[0].value, ri);
              }
            }
            if (sp.mn === 'SBR' && !(isTop && i === 0 && path.length === 0 && ri === 0)) err(n, p, 'SBR must be the first instruction of the first rung of a subroutine');
            const rec = { rcIn: false, rcOut: false, truth: 0 };
            recs.set(n, rec);
            count++;
            out.push({ t: 'I', node: n, spec: sp, refs, rec, truth: 0 });
          });
          return out;
        }
        const items = cseries(rung.items, [], true);
        // Output instructions must come last on their leg (RSLogix 500 rule).
        checkOutputsLast(rung.items, [], (node, p, msg) => err(node, p, msg), profile);
        crungs.push({ items, count: count || 1, rung });
      });
      files.set(f.num, crungs);
      labels.set(f.num, lbl);
    }

    // JMP targets and JSR targets
    for (const f of project.files) {
      f.rungs.forEach((rung, ri) => walkSeries(rung.items, (n, p) => {
        if (n.t !== 'I') return;
        const mn = n.mn.toUpperCase();
        if (mn === 'JMP') {
          const m = /(\d+)$/.exec(n.ops[0] || '');
          if (m && !labels.get(f.num).has(+m[1])) errors.push({ file: f.num, rung: ri, path: p, node: n, msg: `JMP ${n.ops[0]}: no LBL ${n.ops[0]} in this program file` });
        }
      }, []));
    }
    if (!project.files.some((f) => f.num === 2)) errors.push({ file: 2, rung: -1, msg: 'Program file 2 (MAIN) is missing' });
    return { ok: errors.length === 0, errors, files, labels, recs };
  }

  function checkOutputsLast(series, path, err, profile) {
    // Within a series: once an output (or a branch that contains an output)
    // appears, only more outputs/branches of outputs may follow.
    let seenOut = false;
    series.forEach((n, i) => {
      const p = path.concat(i);
      if (n.t === 'B') {
        n.legs.forEach((leg, k) => checkOutputsLast(leg, p.concat('L' + k), err, profile));
        const hasOut = n.legs.some((leg) => containsOutput(leg, profile));
        if (seenOut && n.legs.some((leg) => leg.length && !containsOutput(leg, profile))) err(n, p, 'Input instructions cannot follow an output');
        if (hasOut) seenOut = true;
        return;
      }
      const sp = PLC.spec(n.mn, profile);
      if (!sp) return;
      if (sp.kind === 'out') seenOut = true;
      else if (seenOut) err(n, p, `${n.mn} is an input instruction — it has to be to the left of the outputs`);
    });
  }
  function containsOutput(series, profile) {
    return series.some((n) => (n.t === 'B' ? n.legs.some((l) => containsOutput(l, profile)) : (PLC.spec(n.mn, profile) || {}).kind === 'out'));
  }

  // ---------------- project helpers ----------------
  function newProject(profileId) {
    return {
      format: 'plcsim-1',
      profileId: profileId || PLC.DEFAULT_PROFILE,
      name: 'Untitled',
      files: [{ num: 2, name: 'MAIN', rungs: [{ comment: '', items: [] }] }],
      desc: {},
      data: null,
    };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  PLC.ParseError = ParseError;
  PLC.parseRung = parseRung;
  PLC.parseRungs = parseRungs;
  PLC.rungText = rungText;
  PLC.seriesText = seriesText;
  PLC.liveOps = liveOps;
  PLC.walkSeries = walkSeries;
  PLC.forEachInstr = forEachInstr;
  PLC.compileOperand = compileOperand;
  PLC.applyInitialValues = applyInitialValues;
  PLC.compile = compile;
  PLC.containsOutput = containsOutput;
  PLC.newProject = newProject;
  PLC.clone = clone;
})(typeof window !== 'undefined' ? window : globalThis);
