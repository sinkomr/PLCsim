/*
 * Bottom panels (data table, cross reference, verify, test results) and the
 * right-hand machine / I/O panel.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});
  const esc = (s) => PLC.ladderEsc(s);
  const $ = (id) => document.getElementById(id);

  const STATUS_NOTES = [
    ['S:0/0', 'Carry flag (C)'], ['S:0/1', 'Overflow flag (V)'], ['S:0/2', 'Zero flag (Z)'], ['S:0/3', 'Sign flag (S)'],
    ['S:1/13', 'Major error halted (fault)'], ['S:1/15', 'First pass — on for the first scan only'],
    ['S:2/14', 'Math overflow selected (keep low 16 bits instead of clamping)'],
    ['S:3', 'Low byte: scan time (×10 ms); high byte: watchdog (×10 ms)'], ['S:4', 'Free-running clock (+1 every 10 ms)'],
    ['S:5/0', 'Overflow trap — math overflow happened (faults at end of scan if still set)'],
    ['S:6', 'Major error code (hex)'], ['S:13', 'Math register low word'], ['S:14', 'Math register high word'],
  ];

  function fmt(v, radix) {
    if (radix === 'hex') return (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0') + 'h';
    if (radix === 'bin') return (v & 0xFFFF).toString(2).padStart(16, '0').replace(/(.{4})(?!$)/g, '$1 ');
    return String(v);
  }
  function parseNum(s) {
    const c = PLC.parseConst(String(s).replace(/\s+/g, '').replace(/^([01]{5,16})$/, '&B$1'));
    return c;
  }

  class Panels {
    constructor(app) {
      this.app = app;
      this.tab = 'data';
      this.dtFile = 1;
      this.radix = 'dec';
      this.showAll = false;
      this.popover = null;
      $('bottomTabs').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-tab]');
        if (b) { this.tab = b.dataset.tab; $('bottom').classList.remove('collapsed'); this.render(); }
        if (e.target.id === 'btnBottomToggle') $('bottom').classList.toggle('collapsed');
      });
      this.initResize();
      document.addEventListener('pointerdown', (e) => { if (this.popover && !this.popover.contains(e.target)) this.closePopover(); });
    }

    initResize() {
      const bar = $('bottomResize'), bottom = $('bottom');
      bar.addEventListener('pointerdown', (e) => {
        const y0 = e.clientY, h0 = bottom.getBoundingClientRect().height;
        bottom.classList.remove('collapsed');
        const mv = (ev) => { const h = Math.max(38, Math.min(window.innerHeight * 0.75, h0 - (ev.clientY - y0))); document.documentElement.style.setProperty('--bottom-h', h + 'px'); };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.app.editor.render(); };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
      });
    }

    show(tab) { this.tab = tab; $('bottom').classList.remove('collapsed'); this.render(); }

    render() {
      document.querySelectorAll('#bottomTabs button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
      const body = $('bottomBody');
      if (this.tab === 'data') this.renderData(body);
      else if (this.tab === 'xref') this.renderXref(body);
      else if (this.tab === 'verify') this.renderVerify(body);
      else if (this.tab === 'tests') this.renderTests(body);
    }

    // ---------------- data table ----------------
    usedMax(fileNum) {
      const dt = this.app.engine.dt;
      let mx = -1;
      PLC.forEachInstr(this.app.project, (n) => n.ops.forEach((o) => {
        const r = dt.tryParse(o);
        if (r && r.file === fileNum) mx = Math.max(mx, r.elem !== undefined ? r.elem : r.word);
      }));
      return mx;
    }
    renderData(body) {
      const dt = this.app.engine.dt;
      const files = [...dt.files.values()];
      if (!dt.files.has(this.dtFile)) this.dtFile = 1;
      const f = dt.file(this.dtFile);
      const letter = f.type;
      const name = (f.type === 'O' || f.type === 'I' || f.type === 'S') ? `${f.type}${f.num}` : `${f.type}${f.num}`;
      let rows = '';
      let count = f.len;
      const fixed = this.app.engine.profile.fixedFiles || ['O', 'I', 'S'].includes(f.type);
      if (!fixed && !this.showAll) count = Math.min(f.len, Math.max(8, this.usedMax(f.num) + 4));
      const desc = this.app.descAll();
      const bitCells = (wordIdx, prefix, physical) => {
        let s = '';
        for (let b = 15; b >= 0; b--) {
          const a = `${prefix}/${b}`;
          const ghost = physical !== undefined && b >= physical ? ' ghost' : '';
          s += `<span class="bitcell${ghost}" data-w="${wordIdx}" data-b="${b}" title="${esc(a + (desc[a] ? ' — ' + desc[a] : ''))}">0</span>`;
          if (b % 4 === 0 && b) s += '<span class="bitgrp"></span>';
        }
        return s;
      };
      const bitHead = () => { let s = ''; for (let b = 15; b >= 0; b--) { s += `<span class="bitcell" style="cursor:default">${b}</span>`; if (b % 4 === 0 && b) s += '<span class="bitgrp"></span>'; } return s; };
      if (letter === 'I' || letter === 'O') {
        const slots = letter === 'I' ? dt.inSlots : dt.outSlots;
        rows += `<tr><th>Address</th><th>${bitHead()}</th><th>Slot</th></tr>`;
        for (const [slot, sl] of slots) {
          for (let w = 0; w < sl.words; w++) {
            const prefix = `${letter}:${slot}${w ? '.' + w : ''}`;
            const phys = Math.max(0, Math.min(16, sl.points - w * 16));
            const prof = this.app.engine.profile.slots.find((s) => s.slot === slot);
            rows += `<tr><td class="addr">${prefix}</td><td>${bitCells(sl.start + w, prefix, phys)}</td><td class="dsc">${esc(prof ? prof.name : '')}</td></tr>`;
          }
        }
      } else if (letter === 'B' || letter === 'S') {
        rows += `<tr><th>Address</th><th>${bitHead()}</th><th>${letter === 'S' ? 'Decimal' : ''}</th></tr>`;
        for (let e = 0; e < count; e++) {
          const prefix = `${name}:${e}`.replace(/^S2:/, 'S:');
          rows += `<tr><td class="addr">${prefix}</td><td>${bitCells(e, prefix)}</td><td>${letter === 'S' ? `<span class="mono" data-sv="${e}"></span>` : ''}</td></tr>`;
        }
      } else if (letter === 'N' || letter === 'F') {
        rows += `<tr><th>Address</th><th>Value</th><th>Description</th></tr>`;
        for (let e = 0; e < count; e++) {
          const a = `${name}:${e}`;
          rows += `<tr><td class="addr">${a}</td><td><input class="num" data-nw="${e}"></td><td><input class="dsc" data-desc="${a}" value="${esc(desc[a] || '')}" placeholder="—"></td></tr>`;
        }
      } else {
        const bits = Object.keys(PLC.SUB_BITS[letter]);
        const words = Object.keys(PLC.SUB_WORDS[letter]);
        rows += `<tr><th>Address</th><th>Status bits</th><th>${words[0]}</th><th>${words[1]}</th><th>Description</th></tr>`;
        for (let e = 0; e < count; e++) {
          const a = `${name}:${e}`;
          rows += `<tr><td class="addr">${a}</td><td>${bits.map((b) => `<span class="flag" data-fl="${e}" data-fb="${PLC.SUB_BITS[letter][b]}">${b}</span>`).join('')}</td>
            <td><input class="num" data-ew="${e * 3 + 1}"></td><td><input class="num" data-ew="${e * 3 + 2}"></td>
            <td><input class="dsc" data-desc="${a}" value="${esc(desc[a] || '')}" placeholder="—"></td></tr>`;
        }
      }
      const notes = letter === 'S' ? `<div style="margin-top:10px"><table class="dt"><tr><th>Status bit</th><th>Meaning</th><th>Now</th></tr>${STATUS_NOTES.map(([a, m]) => `<tr><td class="addr">${a}</td><td class="dsc" style="max-width:none">${esc(m)}</td><td class="mono" data-sn="${a}"></td></tr>`).join('')}</table></div>` : '';
      const tip = letter === 'I' ? 'Click a bit to toggle that input terminal. Faded bits have no terminal on this controller.' :
        letter === 'O' ? 'Output image. The program overwrites these every scan — use Force (click an output in the I/O list) to override a terminal.' :
        letter === 'T' || letter === 'C' || letter === 'R' ? 'Edit PRE/ACC directly (works while running).' : 'Click bits to toggle them; type values to change words.';
      body.innerHTML = `<div class="dt-wrap">
        <div class="dt-files">${files.map((x) => `<button data-file="${x.num}" class="${x.num === this.dtFile ? 'active' : ''}">${x.type === 'O' || x.type === 'I' || x.type === 'S' ? x.type + x.num : x.type + x.num}<small>${PLC.TYPE_NAMES[x.type]}</small></button>`).join('')}</div>
        <div class="dt-main">
          <div class="row" style="margin-bottom:6px;font-size:12px;color:var(--muted)">
            <span>${esc(tip)}</span><span class="spacer"></span>
            ${letter === 'N' ? `<label>Radix <select class="sel" id="dtRadix" style="height:24px;font-size:12px"><option value="dec">Decimal</option><option value="hex">Hex</option><option value="bin">Binary</option></select></label>` : ''}
            ${!fixed ? `<label><input type="checkbox" id="dtAll" ${this.showAll ? 'checked' : ''}> show all ${f.len}</label>` : `<span>${f.len} element${f.len > 1 ? 's' : ''} (fixed)</span>`}
          </div>
          <table class="dt">${rows}</table>${notes}
        </div></div>`;
      body.querySelectorAll('[data-file]').forEach((b) => b.onclick = () => { this.dtFile = +b.dataset.file; this.render(); });
      const rs = $('dtRadix');
      if (rs) { rs.value = this.radix; rs.onchange = () => { this.radix = rs.value; this.tick(true); }; }
      const all = $('dtAll');
      if (all) all.onchange = () => { this.showAll = all.checked; this.render(); };
      body.querySelectorAll('.bitcell[data-w]').forEach((c) => c.onclick = () => {
        const w = +c.dataset.w, b = +c.dataset.b;
        if (f.type === 'I') {
          const eng = this.app.engine;
          const cur = (eng.inputs[w] >> b) & 1;
          if (cur) eng.inputs[w] &= ~(1 << b); else eng.inputs[w] |= 1 << b;
          if (eng.mode !== 'RUN') dt.file(1).data[w] = eng.inputs[w];
        } else {
          const d = f.data;
          d[w] ^= 1 << b;
        }
        this.tick(true);
      });
      body.querySelectorAll('input.num').forEach((inp) => inp.onchange = () => {
        const v = parseNum(inp.value);
        if (v === null || (!Number.isInteger(v) && f.type !== 'F')) { inp.classList.add('bad'); return; }
        inp.classList.remove('bad');
        const idx = inp.dataset.nw !== undefined ? +inp.dataset.nw : +inp.dataset.ew;
        f.data[idx] = f.type === 'F' ? v : PLC.toInt16(v);
        inp.blur();
        this.tick(true);
      });
      body.querySelectorAll('input.dsc').forEach((inp) => inp.onchange = () => this.app.editor.setDesc(inp.dataset.desc, inp.value));
      this.tick(true);
    }

    tick(force) {
      if (this.tab !== 'data' || $('bottom').classList.contains('collapsed')) return;
      const body = $('bottomBody');
      const eng = this.app.engine;
      const dt = eng.dt;
      const f = dt.file(this.dtFile);
      if (!f) return;
      const d = f.data;
      const forced = new Set();
      for (const { ref } of eng.forces.values()) if (ref.file === f.num) forced.add(ref.word * 16 + ref.bit);
      body.querySelectorAll('.bitcell[data-w]').forEach((c) => {
        const w = +c.dataset.w, b = +c.dataset.b;
        const on = (d[w] >> b) & 1;
        if (c.textContent !== String(on)) c.textContent = on;
        c.classList.toggle('on', !!on);
        c.classList.toggle('forced', forced.has(w * 16 + b));
      });
      body.querySelectorAll('[data-sv]').forEach((c) => { c.textContent = String(d[+c.dataset.sv]); });
      body.querySelectorAll('[data-sn]').forEach((c) => {
        const r = dt.tryParse(c.dataset.sn);
        if (!r) return;
        const v = r.kind === 'bit' ? dt.getBit(r) : dt.getWord(r);
        c.textContent = c.dataset.sn === 'S:6' ? (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0') + 'h' : String(v);
      });
      body.querySelectorAll('input.num').forEach((inp) => {
        if (document.activeElement === inp) return;
        const idx = inp.dataset.nw !== undefined ? +inp.dataset.nw : +inp.dataset.ew;
        const v = f.type === 'F' ? String(+(+d[idx]).toPrecision(7)) : fmt(d[idx], inp.dataset.nw !== undefined ? this.radix : 'dec');
        if (inp.value !== v) inp.value = v;
      });
      body.querySelectorAll('[data-fl]').forEach((c) => {
        c.classList.toggle('on', !!((d[+c.dataset.fl * 3] >> +c.dataset.fb) & 1));
      });
    }

    // ---------------- cross reference ----------------
    renderXref(body) {
      const app = this.app;
      const dt = app.engine.dt;
      const map = new Map();
      PLC.forEachInstr(app.project, (n, f, ri) => n.ops.forEach((o) => {
        const r = dt.tryParse(o);
        if (!r || r.kind === 'const') return;
        const key = r.text;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ n, f, ri });
      }));
      const order = 'OISBTCRNF';
      const keys = [...map.keys()].sort((a, b) => {
        const fa = order.indexOf(a.replace('#', '')[0]), fb = order.indexOf(b.replace('#', '')[0]);
        return fa - fb || a.localeCompare(b, undefined, { numeric: true });
      });
      const desc = app.descAll();
      if (!keys.length) { body.innerHTML = '<p class="prop-help">No addresses used yet.</p>'; return; }
      body.innerHTML = `<table class="dt"><tr><th>Address</th><th>Description</th><th>Used in</th></tr>${keys.map((k) => `<tr><td class="addr">${esc(k)}</td><td class="dsc">${esc(desc[k] || '')}</td><td>${map.get(k).map((u, i) => `<a href="#" data-x="${esc(k)}" data-i="${i}">LAD ${u.f.num}:${String(u.ri).padStart(3, '0')} ${esc(u.n.mn)}</a>`).join(' &nbsp; ')}</td></tr>`).join('')}</table>`;
      body.querySelectorAll('a[data-x]').forEach((a) => a.onclick = (e) => {
        e.preventDefault();
        const u = map.get(a.dataset.x)[+a.dataset.i];
        app.focusNode(u.f.num, u.ri, u.n);
      });
    }

    // ---------------- verify ----------------
    renderVerify(body) {
      const res = this.app.verify(true);
      const issues = res.issues;
      if (!issues.length) { body.innerHTML = '<p><span class="sev ok">OK</span> No errors or warnings. Your program is ready to RUN.</p>'; return; }
      body.innerHTML = `<ul class="issues">${issues.map((i, k) => `<li data-k="${k}"><span class="sev ${i.sev}">${i.sev === 'error' ? 'ERROR' : 'WARN'}</span><span class="where">${i.rung >= 0 ? `LAD ${i.file}:${String(i.rung).padStart(3, '0')}` : ''}</span><span>${esc(i.msg)}</span></li>`).join('')}</ul>`;
      body.querySelectorAll('li[data-k]').forEach((li) => li.onclick = () => {
        const i = issues[+li.dataset.k];
        if (i.rung >= 0) this.app.focusNode(i.file, i.rung, i.node);
      });
    }

    // ---------------- test results ----------------
    renderTests(body) {
      const r = this.app.lastGrade;
      if (!r) { body.innerHTML = '<p class="prop-help">Open a challenge from the <b>Challenges</b> tab and press <b>Run tests</b>. The grader runs your program in a private copy of the PLC, presses the buttons for you, and checks the outputs.</p>'; return; }
      body.innerHTML = PLC.renderGradeHTML(r.result, r.title) + '<div class="timing" id="timingHost"></div>';
      if (r.result.trace && r.result.trace.samples.length) PLC.renderTiming($('timingHost'), r.result);
    }

    // ---------------- popover ----------------
    openPopover(x, y, items) {
      this.closePopover();
      const p = document.createElement('div');
      p.className = 'popover';
      p.innerHTML = items.map((it, i) => `<button data-i="${i}">${esc(it.label)}</button>`).join('');
      document.body.appendChild(p);
      const r = p.getBoundingClientRect();
      p.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
      p.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
      p.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        items[+b.dataset.i].fn();
        this.closePopover();
      });
      this.popover = p;
    }
    closePopover() { if (this.popover) { this.popover.remove(); this.popover = null; } }
  }

  // ---------------- grade rendering (shared with learn.js) ----------------
  PLC.renderGradeHTML = function (res, title) {
    if (res.error) return `<div class="result-banner fail">${esc(title || '')} — could not run the tests</div><pre style="white-space:pre-wrap">${esc(res.error)}</pre>`;
    const nOk = res.steps.filter((s) => s.ok).length;
    return `<div class="result-banner ${res.pass ? 'pass' : 'fail'}">${res.pass ? '✔ All tests passed' : `✘ ${nOk} of ${res.steps.length} steps passed`}${title ? ' — ' + esc(title) : ''}</div>
      <ol class="steps">${res.steps.map((s, i) => `<li><span class="ic ${s.ok ? 'ok' : 'no'}">${s.ok ? '✔' : '✘'}</span>${i + 1}. ${esc(s.desc)} <span class="prop-help">(t = ${(s.t / 1000).toFixed(2)} s)</span>
        ${s.checks.filter((c) => !c.ok || !s.ok).map((c) => `<div class="chk ${c.ok ? '' : 'bad'}">${c.ok ? '✓' : '✗'} ${esc(c.msg)}</div>`).join('')}</li>`).join('')}</ol>`;
  };

  PLC.renderTiming = function (host, res) {
    const sig = res.trace.signals, sm = res.trace.samples;
    const tMax = sm[sm.length - 1].t || 1;
    const W = Math.max(640, host.clientWidth - 10), labW = 150, rowH = 28, top = 26;
    const H = top + sig.length * rowH + 10;
    const x = (t) => labW + (t / tMax) * (W - labW - 16);
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    // step markers
    let prevT = 0;
    res.steps.forEach((st, i) => {
      const xx = x(st.t);
      s += `<path class="${st.ok ? 'grid' : 'fail'}" d="M${xx} ${top - 6}V${H - 6}"/>`;
      s += `<text class="lbl2" x="${(x(prevT) + xx) / 2}" y="14" text-anchor="middle">${i + 1}${st.ok ? '' : '✗'}</text>`;
      prevT = st.t;
    });
    sig.forEach((sg, k) => {
      const y0 = top + k * rowH;
      s += `<text x="4" y="${y0 + 12}">${esc(sg.addr)}</text><text class="lbl2" x="4" y="${y0 + 24}">${esc((sg.label || '').slice(0, 22))}</text>`;
      if (sg.bit) {
        let d = '';
        sm.forEach((p, i) => {
          const yy = y0 + (p.v[k] ? 4 : 20);
          const xx = x(p.t);
          d += i ? `H${xx}V${yy}` : `M${xx} ${yy}`;
        });
        s += `<path class="sig" d="${d}"/>`;
      } else {
        let last = null, lx = labW;
        sm.forEach((p) => {
          if (p.v[k] !== last) {
            s += `<path class="grid" d="M${x(p.t)} ${y0 + 4}V${y0 + 20}"/><text x="${x(p.t) + 3}" y="${y0 + 16}">${p.v[k]}</text>`;
            last = p.v[k]; lx = x(p.t);
          }
        });
      }
    });
    s += `<text class="lbl2" x="${W - 16}" y="${H - 1}" text-anchor="end">${(tMax / 1000).toFixed(2)} s</text></svg>`;
    host.innerHTML = s;
  };

  // ---------------- I/O / machine panel ----------------
  class IOPanel {
    constructor(app) {
      this.app = app;
      this.sceneId = 'trainer';
      this.scene = null;
      this.trainerModes = {}; // addr → 'switch' | 'pb-no' | 'pb-nc'
      const sel = $('sceneSel');
      sel.innerHTML = PLC.SCENE_DEFS.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
      sel.onchange = () => { this.app.project.scene = sel.value; this.load(sel.value); this.app.saveSoon(); this.app.editor.render(); };
      this.msgTimer = null;
    }

    get eng() { return this.app.engine; }
    ref(addr) {
      const a = PLC.remapIO(addr, this.eng.profile);
      return this.eng.dt.tryParse(a);
    }
    labels() {
      const def = PLC.getSceneDef(this.sceneId);
      const out = {};
      const prof = this.eng.profile;
      for (const [a, v] of Object.entries(def.inputs)) out[PLC.remapIO(a, prof)] = v.label;
      for (const [a, v] of Object.entries(def.outputs)) out[PLC.remapIO(a, prof)] = v.label;
      return out;
    }

    load(id) {
      if (this.scene) { try { this.scene.destroy(); } catch (e) { /* ignore */ } this.scene = null; }
      this.sceneId = PLC.getSceneDef(id).id;
      $('sceneSel').value = this.sceneId;
      const host = $('sceneHost');
      host.innerHTML = '';
      $('sceneMsg').textContent = '';
      const def = PLC.getSceneDef(this.sceneId);
      const eng = this.eng;
      // Normally-closed devices start closed (input = 1).
      for (const [a, v] of Object.entries(def.inputs)) {
        const r = this.ref(a);
        if (r && v.device === 'pb-nc') eng.inputs[r.word] |= 1 << r.bit;
      }
      if (this.sceneId !== 'trainer') {
        const create = PLC.SCENES && PLC.SCENES[this.sceneId];
        if (!create) host.innerHTML = '<p class="prop-help">This machine is not available.</p>';
        else {
          const api = {
            def,
            out: (a) => { const r = this.ref(a); return r ? ((eng.outputs[r.word] | eng.outSeen[r.word]) >> r.bit) & 1 : 0; },
            set: (a, v) => { const r = this.ref(a); if (!r) return; if (v) eng.inputs[r.word] |= 1 << r.bit; else eng.inputs[r.word] &= ~(1 << r.bit); },
            get: (a) => { const r = this.ref(a); return r ? (eng.inputs[r.word] >> r.bit) & 1 : 0; },
            running: () => eng.mode === 'RUN',
            message: (text, level) => this.message(text, level),
          };
          try { this.scene = create(host, api); } catch (e) { host.innerHTML = `<p class="prop-err">Scene error: ${esc(e.message)}</p>`; console.error(e); }
        }
        const need = Object.keys(def.outputs).map((a) => this.ref(a)).filter(Boolean);
        const missing = Object.keys(def.outputs).concat(Object.keys(def.inputs)).filter((a) => !this.physical(PLC.remapIO(a, eng.profile)));
        if (missing.length) this.message(`Heads-up: ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not wired on the ${eng.profile.short}. Pick a controller with more I/O for this machine.`, 'warn', true);
        void need;
      }
      this.renderOperator();
      this.renderStrip();
    }

    physical(addr) {
      const dt = this.eng.dt;
      const r = dt.tryParse(addr);
      if (!r || r.kind !== 'bit') return false;
      const slots = r.file === 1 ? dt.inSlots : dt.outSlots;
      for (const [, sl] of slots) if (r.word >= sl.start && r.word < sl.start + sl.words) return (r.word - sl.start) * 16 + r.bit < sl.points;
      return false;
    }

    message(text, level, sticky) {
      const el = $('sceneMsg');
      el.textContent = text || '';
      el.className = 'scene-msg ' + (level || '');
      clearTimeout(this.msgTimer);
      if (!sticky) this.msgTimer = setTimeout(() => { el.textContent = ''; }, 6000);
    }

    // Physical points for the current controller.
    points() {
      const dt = this.eng.dt, prof = this.eng.profile;
      const ins = [], outs = [];
      for (const s of prof.slots) {
        for (let p = 0; p < s.inputs; p++) ins.push(dt.ioText('I', s.slot, p));
        for (let p = 0; p < s.outputs; p++) outs.push(dt.ioText('O', s.slot, p));
      }
      return { ins, outs };
    }

    buttonColor(label) {
      const L = (label || '').toUpperCase();
      if (/STOP|RESET/.test(L)) return 'red';
      if (/START|FORWARD|ON/.test(L)) return 'green';
      if (/PEDESTRIAN/.test(L)) return 'yellow';
      if (/REVERSE/.test(L)) return 'blue';
      return 'black';
    }

    renderOperator() {
      const host = $('opPanel');
      const def = PLC.getSceneDef(this.sceneId);
      const eng = this.eng;
      const prof = eng.profile;
      if (this.sceneId === 'trainer') {
        const { ins, outs } = this.points();
        const desc = this.app.descAll();
        host.innerHTML = `<p class="prop-help" style="margin:0 0 6px">${esc(def.blurb)} Choose what kind of device is wired to each input.</p>
          <div class="trainer-cols"><div>${ins.map((a) => {
            const m = this.trainerModes[a] || 'switch';
            return `<div class="trainer-row"><span class="a">${a}</span>${m === 'switch' ? `<button class="sw" data-in="${a}" aria-label="toggle ${a}"></button>` : `<button class="pb ${m === 'pb-nc' ? 'red' : 'green'}" style="width:28px;height:28px;border-width:2px" data-pb="${a}" data-nc="${m === 'pb-nc' ? 1 : 0}" aria-label="push ${a}"></button>`}
              <select data-mode="${a}"><option value="switch">Switch</option><option value="pb-no">N.O. button</option><option value="pb-nc">N.C. button</option></select>
              <span class="l" style="color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(desc[a] || '')}</span></div>`;
          }).join('')}</div>
          <div>${outs.map((a) => `<div class="trainer-row"><span class="a">${a}</span><span class="lamp green" data-lamp="${a}"></span><span class="l" style="color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(desc[a] || '')}</span></div>`).join('')}</div></div>`;
        host.querySelectorAll('select[data-mode]').forEach((s) => {
          s.value = this.trainerModes[s.dataset.mode] || 'switch';
          s.onchange = () => {
            const a = s.dataset.mode;
            this.trainerModes[a] = s.value;
            const r = eng.dt.parse(a);
            if (s.value === 'pb-nc') eng.inputs[r.word] |= 1 << r.bit; else eng.inputs[r.word] &= ~(1 << r.bit);
            this.renderOperator();
          };
        });
      } else {
        const ops = Object.entries(def.inputs).filter(([, v]) => v.device !== 'sensor');
        host.innerHTML = ops.length ? `<div class="opanel">${ops.map(([a0, v]) => {
          const a = PLC.remapIO(a0, prof);
          if (v.device === 'switch') return `<div class="opdev"><button class="sw" data-in="${a}"></button><span class="ad">${a}</span><span class="cap">${esc(v.label)}</span></div>`;
          return `<div class="opdev"><button class="pb ${this.buttonColor(v.label)}" data-pb="${a}" data-nc="${v.device === 'pb-nc' ? 1 : 0}" title="${v.device === 'pb-nc' ? 'Normally closed: the input is ON until you press' : 'Normally open: the input is ON while pressed'}"></button><span class="ad">${a}</span><span class="cap">${esc(v.label)}${v.device === 'pb-nc' ? ' (N.C.)' : ''}</span></div>`;
        }).join('')}</div>` : '';
      }
      host.querySelectorAll('[data-in]').forEach((b) => b.onclick = () => {
        const r = eng.dt.parse(b.dataset.in);
        eng.inputs[r.word] ^= 1 << r.bit;
      });
      host.querySelectorAll('[data-pb]').forEach((b) => {
        const r = eng.dt.parse(b.dataset.pb);
        const nc = b.dataset.nc === '1';
        const set = (pressed) => {
          const on = nc ? !pressed : pressed;
          if (on) eng.inputs[r.word] |= 1 << r.bit; else eng.inputs[r.word] &= ~(1 << r.bit);
          b.classList.toggle('pressed', pressed);
        };
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); set(true); });
        b.addEventListener('pointerup', () => set(false));
        b.addEventListener('pointercancel', () => set(false));
        b.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set(true); } });
        b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') set(false); });
      });
    }

    renderStrip() {
      const host = $('ioStrip');
      const { ins, outs } = this.points();
      const desc = this.app.descAll();
      const item = (a) => `<div class="ioitem" data-io="${a}" title="Click to force"><span class="led" data-led="${a}"></span><span class="a">${a}</span><span class="l">${esc(desc[a] || '')}</span><span class="F hidden" data-f="${a}">F</span></div>`;
      host.innerHTML = `<h3 style="margin:12px 0 4px">Inputs <span class="prop-help" style="text-transform:none;letter-spacing:0">— click one to force it</span></h3><div class="iostrip">${ins.map(item).join('')}</div>
        <h3 style="margin:10px 0 4px">Outputs</h3><div class="iostrip">${outs.map(item).join('')}</div>
        <div class="row" style="margin-top:6px"><button class="btn small" id="btnClrForces">Remove all forces</button></div>`;
      host.querySelectorAll('[data-io]').forEach((el) => el.onclick = (e) => {
        const a = el.dataset.io;
        const eng = this.eng;
        const isIn = a.startsWith('I');
        const items = [
          { label: `Force ${a} ON`, fn: () => eng.setForce(a, 1) },
          { label: `Force ${a} OFF`, fn: () => eng.setForce(a, 0) },
          { label: 'Remove force', fn: () => eng.setForce(a, null) },
        ];
        if (isIn) items.unshift({ label: 'Toggle input (no force)', fn: () => { const r = eng.dt.parse(a); eng.inputs[r.word] ^= 1 << r.bit; } });
        this.app.panels.openPopover(e.clientX, e.clientY, items);
      });
      $('btnClrForces').onclick = () => this.eng.clearForces();
    }

    // Called every frame
    tick(simMs) {
      const eng = this.eng;
      if (this.scene && this.scene.update) {
        try { this.scene.update(simMs); } catch (e) { console.error(e); this.scene = null; }
      }
      eng.outSeen.set(eng.outputs); // pulses have been shown; start collecting again
      const I = eng.dt.file(1).data;
      document.querySelectorAll('#ioStrip [data-led]').forEach((el) => {
        const r = eng.dt.tryParse(el.dataset.led);
        if (!r) return;
        const on = r.file === 1 ? ((eng.mode === 'RUN' || eng.mode === 'TEST' ? I[r.word] : eng.inputs[r.word]) >> r.bit) & 1 : (eng.outputs[r.word] >> r.bit) & 1;
        el.classList.toggle('on', !!on);
      });
      document.querySelectorAll('#ioStrip [data-f]').forEach((el) => el.classList.toggle('hidden', !eng.forces.has(el.dataset.f)));
      document.querySelectorAll('#opPanel [data-lamp]').forEach((el) => {
        const r = eng.dt.tryParse(el.dataset.lamp);
        el.classList.toggle('on', !!(r && (eng.outputs[r.word] >> r.bit) & 1));
      });
      document.querySelectorAll('#opPanel .sw[data-in]').forEach((el) => {
        const r = eng.dt.tryParse(el.dataset.in);
        el.classList.toggle('on', !!(r && (eng.inputs[r.word] >> r.bit) & 1));
      });
    }

    resetScene() { if (this.scene && this.scene.reset) this.scene.reset(); }
  }

  PLC.Panels = Panels;
  PLC.IOPanel = IOPanel;
})(typeof window !== 'undefined' ? window : globalThis);
