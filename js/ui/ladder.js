/*
 * Ladder diagram renderer (SVG).
 *
 * renderLadder(host, opts) draws rungs and returns a handle with update()
 * for live power-flow / value animation without rebuilding the DOM.
 *
 * opts = {
 *   rungs, profile, dt (optional DataTable for live PRE/ACC and values),
 *   desc  {addr: text}, errors Map(node → [msg]), recs Map(node → rec),
 *   editable, sel, width, startIndex, showEnd,
 *   on: { instr(node, info, ev), gap(info, ev), rung(ri, ev), branch(node, info, ev), addRung() }
 * }
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  const K = {
    cw: 92,          // contact / coil width
    ch: 50,          // contact / coil height without description
    descLine: 12,
    boxW: 176,
    boxHead: 24,
    boxLine: 16,
    gap: 16,
    legGap: 10,
    bpad: 10,        // branch side padding
    rail: 52,        // left margin incl. rung number
    rungGapY: 18,
    commentLine: 15,
  };
  const BITS_FOR = {
    TON: ['EN', 'DN'], TOF: ['EN', 'DN'], RTO: ['EN', 'DN'],
    CTU: ['CU', 'DN'], CTD: ['CD', 'DN'],
    BSL: ['EN', 'DN'], BSR: ['EN', 'DN'], SQO: ['EN', 'DN'], SQC: ['EN', 'DN', 'FD'],
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function spec(n, profile) { return PLC.spec(n.mn, profile); }
  function isBox(sp, n) {
    if (!sp) return false;
    return !!sp.box || sp.ops.length > 1 || n.mn === 'JSR';
  }
  function wrapDesc(text, maxChars, maxLines) {
    if (!text) return [];
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars) {
        if (cur) lines.push(cur);
        cur = w;
        if (lines.length === maxLines) break;
      } else cur = (cur + ' ' + w).trim();
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    return lines.map((l) => (l.length > maxChars ? l.slice(0, maxChars - 1) + '…' : l));
  }

  // ---------------- layout ----------------
  function measure(n, ctx) {
    if (n.t === 'B') {
      const legs = n.legs.map((l) => measureSeries(l, ctx));
      const w = Math.max(...legs.map((l) => l.w)) + 2 * K.bpad;
      let h = 0;
      legs.forEach((l, i) => { h += l.h + (i ? K.legGap : 0); });
      const m = { w, h, wy: legs[0].wy, legs };
      n.__m = m;
      return m;
    }
    const sp = spec(n, ctx.profile);
    let m;
    if (isBox(sp, n)) {
      const lines = sp ? sp.ops.length : 1;
      const bits = BITS_FOR[sp && sp.mn] ? 34 : 0;
      m = { w: K.boxW + bits, h: K.boxHead + Math.max(1, lines) * K.boxLine + 10, wy: K.boxHead / 2 + 2, box: true, bits };
    } else {
      const addr = n.ops[0];
      const d = addr && ctx.desc ? wrapDesc(ctx.desc[addr], 15, 2) : [];
      const dh = d.length * K.descLine;
      m = { w: K.cw, h: K.ch + dh, wy: K.ch + dh - 16, desc: d };
    }
    n.__m = m;
    return m;
  }
  function measureSeries(series, ctx, stretchIndex, minW) {
    const ms = series.map((n) => measure(n, ctx));
    let wy = 12, below = 12;
    for (const m of ms) { wy = Math.max(wy, m.wy); below = Math.max(below, m.h - m.wy); }
    let w = ms.reduce((a, m) => a + m.w, 0) + K.gap * (ms.length + 1);
    if (!ms.length) w = K.gap * 2 + 20;
    let stretch = 0;
    if (minW && w < minW) { stretch = minW - w; w = minW; }
    return { w, h: wy + below, wy, ms, stretch, stretchIndex };
  }

  // Index of the first item of the trailing output group on the top level.
  function outputStart(series, profile) {
    let i = series.length;
    while (i > 0) {
      const n = series[i - 1];
      const out = n.t === 'B' ? PLC.containsOutput([n], profile) : (spec(n, profile) || {}).kind === 'out';
      if (!out) break;
      i--;
    }
    return i;
  }

  // ---------------- drawing ----------------
  function renderLadder(host, opts) {
    const profile = opts.profile;
    const dt = opts.dt;
    const ctx = { profile, desc: opts.desc || {} };
    const width = Math.max(opts.width || host.clientWidth || 800, 480);
    const nodes = [];   // id → {node, info}
    const gaps = [];    // id → info
    const wires = [];   // id → getter
    const vals = [];    // id → getter
    const bits = [];    // id → getter
    const branches = [];
    const out = [];
    let y = 8;
    const recs = opts.recs;
    const rec = (n) => (recs && recs.get(n)) || null;
    const errs = opts.errors || new Map();
    const sel = opts.sel || {};

    function wire(x1, y1, x2, y2, getter) {
      const id = wires.length;
      wires.push(getter || null);
      out.push(`<path class="w" data-w="${id}" d="M${x1} ${y1}H${x2}${y2 !== undefined && y2 !== y1 ? 'V' + y2 : ''}"/>`);
    }
    function vwire(x, y1, y2, getter) {
      const id = wires.length;
      wires.push(getter || null);
      out.push(`<path class="w" data-w="${id}" d="M${x} ${y1}V${y2}"/>`);
    }
    function gapTarget(x, wy, w, info) {
      if (!opts.editable) return;
      const id = gaps.length;
      gaps.push(info);
      const selected = sel.kind === 'gap' && sel.series === info.series && sel.index === info.index;
      out.push(`<rect class="gap${selected ? ' sel' : ''}" data-g="${id}" x="${x}" y="${wy - 11}" width="${w}" height="22" rx="4"/>`);
      if (selected) out.push(`<rect class="cursor" x="${x + w / 2 - 1.5}" y="${wy - 13}" width="3" height="26" rx="1.5"/>`);
    }

    function drawSeries(series, m, x, top, rungIdx, rcIn) {
      const wy = top + m.wy;
      let cx = x;
      let prevGetter = rcIn;
      const nItems = series.length;
      if (!nItems) {
        wire(cx, wy, cx + m.w, undefined, prevGetter);
        gapTarget(cx + 2, wy, m.w - 4, { series, index: 0, rung: rungIdx });
        return prevGetter;
      }
      for (let i = 0; i <= nItems; i++) {
        let gw = K.gap;
        if (i === m.stretchIndex) gw += m.stretch;
        if (i === nItems && m.stretchIndex === undefined) gw = x + m.w - cx; // fill to end
        wire(cx, wy, cx + gw, undefined, prevGetter);
        gapTarget(cx + 1, wy, gw - 2, { series, index: i, rung: rungIdx });
        cx += gw;
        if (i === nItems) break;
        const n = series[i];
        const nm = m.ms[i];
        const itop = wy - nm.wy;
        if (n.t === 'B') prevGetter = drawBranch(n, nm, cx, itop, rungIdx, prevGetter, series, i);
        else prevGetter = drawInstr(n, nm, cx, itop, rungIdx, series, i, prevGetter);
        cx += nm.w;
      }
      return prevGetter;
    }

    function drawBranch(n, m, x, top, rungIdx, rcIn, series, index) {
      const r = rec(n);
      const getIn = r ? () => r.rcIn : rcIn;
      const getOut = r ? () => r.rcOut : null;
      const id = branches.length;
      branches.push({ node: n, info: { series, index, rung: rungIdx } });
      const selected = sel.kind === 'branch' && sel.node === n;
      let ly = top;
      const wys = [];
      n.legs.forEach((leg, k) => {
        const lm = m.legs[k];
        const wy = ly + lm.wy;
        wys.push(wy);
        // leg: left stub, series, right stub (to the right vertical)
        const legRc = getIn;
        wire(x, wy, x + K.bpad, undefined, legRc);
        const legOut = drawSeries(leg, Object.assign({}, lm, { w: lm.w }), x + K.bpad, ly, rungIdx, legRc);
        const endX = x + K.bpad + lm.w;
        wire(endX, wy, x + m.w, undefined, legOut);
        ly += lm.h + K.legGap;
      });
      vwire(x, wys[0], wys[wys.length - 1], getIn);
      vwire(x + m.w, wys[0], wys[wys.length - 1], getOut);
      if (opts.editable) {
        out.push(`<rect class="bhandle${selected ? ' sel' : ''}" data-b="${id}" x="${x - 5}" y="${wys[0] - 6}" width="10" height="${wys[wys.length - 1] - wys[0] + 12}" rx="4"><title>Branch — click to select, then "Add leg" or Delete</title></rect>`);
      }
      return getOut;
    }

    function valueText(ref) {
      if (!dt || !ref) return null;
      return () => {
        if (ref.kind === 'const') return '';
        const v = ref.kind === 'bit' ? dt.getBit(ref) : dt.getWord(ref);
        return ref.kind === 'float' ? (+v).toPrecision(6).replace(/\.?0+$/, '') : String(v);
      };
    }

    function drawInstr(n, m, x, top, rungIdx, series, index, rcIn) {
      const sp = spec(n, profile);
      const id = nodes.length;
      const r = rec(n);
      nodes.push({ node: n, info: { series, index, rung: rungIdx } });
      const e = errs.get(n);
      const cls = ['ins', sp ? sp.kind : 'bad', m.box ? 'boxi' : '', sel.kind === 'instr' && sel.node === n ? 'sel' : '', e ? 'err' : ''].join(' ');
      out.push(`<g class="${cls}" data-n="${id}" transform="translate(${x},${top})">`);
      out.push(`<rect class="hit" x="0" y="0" width="${m.w}" height="${m.h}" rx="6"/>`);
      if (e) out.push(`<title>${esc(e.join('\n'))}</title>`);
      const wy = m.wy;
      const mn = n.mn;
      if (!m.box) {
        const addr = n.ops[0] !== undefined ? n.ops[0] : '';
        m.desc.forEach((l, k) => out.push(`<text class="desc" x="${m.w / 2}" y="${10 + k * K.descLine}">${esc(l)}</text>`));
        if (sp && sp.ops.length) out.push(`<text class="addr" data-op="0" x="${m.w / 2}" y="${wy - 16}">${esc(addr || '?')}</text>`);
        const cx = m.w / 2;
        const lead = (a, b) => out.push(`<path class="w" data-w="${wires.length}" d="M${a} ${wy}H${b}"/>`);
        if (sp && sp.kind === 'in') {
          // contact: -| |-
          wires.push(rcIn); lead(0, cx - 9);
          wires.push(r ? () => r.rcOut : null); lead(cx + 9, m.w);
          out.push(`<rect class="sym-bg" x="${cx - 9}" y="${wy - 10}" width="18" height="20"/>`);
          out.push(`<path class="sym" d="M${cx - 9} ${wy - 10}V${wy + 10}M${cx + 9} ${wy - 10}V${wy + 10}"/>`);
          if (mn === 'XIO') out.push(`<path class="sym" d="M${cx - 7} ${wy + 9}L${cx + 7} ${wy - 9}"/>`);
          if (mn !== 'XIC' && mn !== 'XIO') out.push(`<text class="mnin" x="${cx}" y="${wy + 22}">${esc(mn)}</text>`);
        } else {
          // coil: -( )-
          wires.push(rcIn); lead(0, cx - 11);
          wires.push(r ? () => r.rcOut : null); lead(cx + 11, m.w);
          out.push(`<rect class="sym-bg" x="${cx - 11}" y="${wy - 11}" width="22" height="22" rx="11"/>`);
          out.push(`<path class="sym" d="M${cx - 5} ${wy - 11}A13 13 0 0 0 ${cx - 5} ${wy + 11}M${cx + 5} ${wy - 11}A13 13 0 0 1 ${cx + 5} ${wy + 11}"/>`);
          const letter = { OTL: 'L', OTU: 'U' }[mn];
          if (letter) out.push(`<text class="coilL" x="${cx}" y="${wy + 4}">${letter}</text>`);
          if (mn !== 'OTE' && !letter) out.push(`<text class="mnin" x="${cx}" y="${wy + 23}">${esc(mn)}</text>`);
        }
      } else {
        // box instruction
        const bw = K.boxW;
        wires.push(rcIn); out.push(`<path class="w" data-w="${wires.length - 1}" d="M0 ${wy}H8"/>`);
        wires.push(r ? () => r.rcOut : null); out.push(`<path class="w" data-w="${wires.length - 1}" d="M${bw - 8} ${wy}H${m.w}"/>`);
        out.push(`<rect class="box" x="8" y="2" width="${bw - 16}" height="${m.h - 6}" rx="5"/>`);
        out.push(`<text class="bmn" x="16" y="${wy + 4}">${esc(mn)}</text>`);
        out.push(`<text class="bname" x="${bw - 14}" y="${wy + 4}">${esc(sp ? sp.name : '?')}</text>`);
        out.push(`<path class="bsep" d="M8 ${K.boxHead}H${bw - 8}"/>`);
        let elemRef = null;
        (sp ? sp.ops : []).forEach((o, k) => {
          const yy = K.boxHead + 14 + k * K.boxLine;
          let shown = n.ops[k] !== undefined ? n.ops[k] : '?';
          out.push(`<text class="blabel" x="16" y="${yy}">${esc(o[0])}</text>`);
          let vid = null;
          let ref = null;
          if (dt) ref = dt.tryParse(n.ops[k]);
          if (['tmr', 'ctr', 'ctl'].includes(o[1]) && ref && ref.kind === 'elem') elemRef = ref;
          if (dt && elemRef && ['pre', 'acc', 'len', 'pos'].includes(o[1])) {
            const off = ['pre', 'len'].includes(o[1]) ? 1 : 2;
            const er = elemRef;
            vid = vals.length;
            vals.push(() => String(dt.file(er.file).data[er.elem * 3 + off]));
            out.push(`<text class="bop" data-op="${k}" data-v="${vid}" x="${bw - 16}" y="${yy}">${esc(shown)}</text>`);
            return;
          }
          out.push(`<text class="bop" data-op="${k}" x="${bw - 16}" y="${yy}">${esc(shown)}</text>`);
          // live source values under word operands (RSLogix shows them with a '<')
          if (dt && ref && (ref.kind === 'word' || ref.kind === 'float') && ['src', 'dst', 'mask'].includes(o[1])) {
            vid = vals.length;
            vals.push(valueText(ref));
            out.push(`<text class="bval" data-v="${vid}" x="${bw - 16 - Math.min(100, String(shown).length * 7.2) - 6}" y="${yy}"></text>`);
          }
        });
        const bl = BITS_FOR[mn];
        if (bl && m.bits) {
          bl.forEach((b, k) => {
            const yy = wy + k * 18;
            const bid = bits.length;
            bits.push(dt && elemRef ? ((er, bb) => () => dt.getBit({ file: er.file, word: er.elem * 3, bit: PLC.SUB_BITS[dt.file(er.file).type][bb] }))(elemRef, b) : null);
            out.push(`<g class="sbit" data-bit="${bid}"><path d="M${bw - 8} ${yy}H${bw + 4}"/><text x="${bw + 6}" y="${yy + 4}">${b}</text></g>`);
          });
        }
      }
      out.push('</g>');
      return r ? () => r.rcOut : null;
    }

    // ---- rungs ----
    const start = opts.startIndex || 0;
    const rungs = opts.rungs;
    const innerX = K.rail;
    const railR = width - 14;
    rungs.forEach((rung, ri) => {
      const idx = start + ri;
      const selR = sel.kind === 'rung' && sel.rung === idx;
      // comment
      if (rung.comment) {
        const maxC = Math.max(30, Math.floor((railR - innerX - 10) / 6.8));
        const lines = [];
        String(rung.comment).split('\n').forEach((para) => {
          let cur = '';
          for (const w of para.split(/\s+/)) {
            if ((cur + ' ' + w).trim().length > maxC && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
          }
          lines.push(cur);
        });
        lines.splice(6);
        lines.forEach((l, k) => out.push(`<text class="rcomment" x="${innerX + 4}" y="${y + 12 + k * K.commentLine}">${esc(l)}</text>`));
        y += lines.length * K.commentLine + 6;
      }
      const avail = railR - innerX;
      const os = outputStart(rung.items, profile);
      const m = measureSeries(rung.items, ctx, os < rung.items.length ? os : undefined, avail);
      if (m.stretchIndex === undefined && m.w < avail) m.w = avail;
      const top = y;
      const wy = top + m.wy;
      const rightX = Math.max(railR, innerX + m.w);
      out.push(`<g class="rung${selR ? ' sel' : ''}" data-r="${idx}">`);
      out.push(`<rect class="rbg" x="2" y="${top - 4}" width="${rightX + 10}" height="${m.h + 8}" rx="6"/>`);
      out.push(`<rect class="rnum-hit" data-rn="${idx}" x="2" y="${top - 4}" width="${K.rail - 16}" height="${m.h + 8}" rx="6"/>`);
      out.push(`<text class="rnum" data-rn="${idx}" x="${(K.rail - 14) / 2 + 2}" y="${wy + 4}">${String(idx).padStart(4, '0')}</text>`);
      out.push('</g>');
      // rails
      out.push(`<path class="rail" d="M${innerX} ${top - 4}V${top + m.h + 4}"/>`);
      out.push(`<path class="rail" d="M${rightX} ${top - 4}V${top + m.h + 4}"/>`);
      const railOn = opts.recs ? () => opts.powered : null;
      drawSeries(rung.items, m, innerX, top, idx, railOn);
      y += m.h + K.rungGapY;
    });
    if (opts.showEnd) {
      out.push(`<g class="endrung"><path class="rail" d="M${innerX} ${y - 4}V${y + 26}"/><path class="rail" d="M${railR} ${y - 4}V${y + 26}"/>`);
      out.push(`<text class="rnum" x="${(K.rail - 14) / 2 + 2}" y="${y + 16}">${String(start + rungs.length).padStart(4, '0')}</text>`);
      out.push(`<text class="endtxt" x="${(innerX + railR) / 2}" y="${y + 16}">(End)</text></g>`);
      y += 34;
    }
    const svgW = Math.max(width, ...[0]);
    let maxX = width;
    const html = out.join('');
    host.innerHTML = `<svg class="ladder-svg" xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${y}" viewBox="0 0 ${svgW} ${y}">${html}</svg>`;
    const svg = host.firstChild;
    // widen if content overflowed (very long rungs)
    try {
      const bb = svg.getBBox();
      maxX = Math.max(width, Math.ceil(bb.x + bb.width + 16));
      if (maxX > width) { svg.setAttribute('width', maxX); svg.setAttribute('viewBox', `0 0 ${maxX} ${y}`); }
    } catch (e) { /* not rendered yet (e.g. hidden) */ }

    // ---- events ----
    if (opts.on) {
      svg.addEventListener('click', (ev) => {
        const t = ev.target;
        const gEl = t.closest('[data-n]');
        if (gEl && opts.on.instr) {
          const d = nodes[+gEl.dataset.n];
          const opEl = t.closest('[data-op]');
          return opts.on.instr(d.node, d.info, ev, opEl ? +opEl.dataset.op : null, gEl);
        }
        const b = t.closest('[data-b]');
        if (b && opts.on.branch) { const d = branches[+b.dataset.b]; return opts.on.branch(d.node, d.info, ev); }
        const gp = t.closest('[data-g]');
        if (gp && opts.on.gap) return opts.on.gap(gaps[+gp.dataset.g], ev);
        const rn = t.closest('[data-rn]');
        if (rn && opts.on.rung) return opts.on.rung(+rn.dataset.rn, ev);
        if (opts.on.background) opts.on.background(ev);
      });
      svg.addEventListener('dblclick', (ev) => {
        const t = ev.target;
        const gEl = t.closest('[data-n]');
        if (gEl && opts.on.instrDbl) {
          const d = nodes[+gEl.dataset.n];
          const opEl = t.closest('[data-op]');
          return opts.on.instrDbl(d.node, d.info, ev, opEl ? +opEl.dataset.op : 0, gEl);
        }
        const rn = t.closest('[data-rn]');
        if (rn && opts.on.rungDbl) return opts.on.rungDbl(+rn.dataset.rn, ev);
      });
      if (opts.on.dragStart) {
        svg.addEventListener('pointerdown', (ev) => {
          const gEl = ev.target.closest('[data-n]');
          if (!gEl || ev.button !== 0) return;
          const d = nodes[+gEl.dataset.n];
          opts.on.dragStart(d.node, d.info, ev, svg, gaps);
        });
      }
    }

    // ---- live update ----
    const wireEls = svg.querySelectorAll('[data-w]');
    const insEls = svg.querySelectorAll('[data-n]');
    const valEls = svg.querySelectorAll('[data-v]');
    const bitEls = svg.querySelectorAll('[data-bit]');
    function update(active) {
      for (const el of wireEls) {
        const f = wires[+el.dataset.w];
        el.classList.toggle('on', !!(active && f && f()));
      }
      for (const el of insEls) {
        const d = nodes[+el.dataset.n];
        const r = rec(d.node);
        let on = false;
        if (active && r) {
          const sp = spec(d.node, profile);
          on = sp && sp.kind === 'in' ? !!r.truth : !!r.rcOut;
          if (sp && sp.kind === 'out' && ['OTL', 'OTU'].includes(sp.mn)) on = !!r.truth;
        }
        el.classList.toggle('on', on);
      }
      if (dt) {
        for (const el of valEls) {
          const f = vals[+el.dataset.v];
          if (f) { const v = f(); if (el.textContent !== v) el.textContent = v; }
        }
        for (const el of bitEls) {
          const f = bits[+el.dataset.bit];
          el.classList.toggle('on', !!(f && f()));
        }
      }
    }
    update(false);
    return { svg, update, gaps, nodes, height: y };
  }

  // Static diagram from rung text (lessons / reference). Returns an element.
  function staticLadder(host, rungTexts, profile, desc, opts) {
    const rungs = [];
    const bad = [];
    for (const t of rungTexts) {
      try { rungs.push(PLC.parseRung(t, profile)); }
      catch (e) { bad.push(`${t} — ${e.message}`); }
    }
    const h = renderLadder(host, Object.assign({ rungs, profile, desc: desc || {}, editable: false, width: (opts && opts.width) || Math.max(host.clientWidth, 520) }, opts || {}));
    if (bad.length) host.insertAdjacentHTML('beforeend', `<pre class="ladder-bad">${esc(bad.join('\n'))}</pre>`);
    return h;
  }

  PLC.renderLadder = renderLadder;
  PLC.staticLadder = staticLadder;
  PLC.ladderEsc = esc;
})(typeof window !== 'undefined' ? window : globalThis);
