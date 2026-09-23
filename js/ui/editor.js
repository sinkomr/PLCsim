/*
 * Ladder editor: instruction palette, program-file tabs, selection,
 * operand editing, drag & drop, properties panel, undo/redo.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});
  const esc = (s) => PLC.ladderEsc(s);
  const $ = (id) => document.getElementById(id);

  const QUICK = ['XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'OSR', 'TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES'];
  const ICON = {
    XIC: '<svg viewBox="0 0 22 16"><path d="M0 8h7M15 8h7M7 2v12M15 2v12" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
    XIO: '<svg viewBox="0 0 22 16"><path d="M0 8h7M15 8h7M7 2v12M15 2v12M8.5 13.5l5-11" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
    OTE: '<svg viewBox="0 0 22 16"><path d="M0 8h6M16 8h6M8.5 2.5a8 8 0 0 0 0 11M13.5 2.5a8 8 0 0 1 0 11" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  };

  class Editor {
    constructor(app) {
      this.app = app;
      this.group = 'Bit';
      this.undoStack = [];
      this.redoStack = [];
      this.clip = null;
      this.handle = null;
      this.opEditor = null;
      this.buildPalette();
      this.bindKeys();
    }

    get project() { return this.app.project; }
    get profile() { return this.app.engine.profile; }
    get file() { return this.project.files.find((f) => f.num === this.app.fileNum) || this.project.files[0]; }
    get sel() { return this.app.sel; }
    set sel(v) { this.app.sel = v; }

    // ---------------- palette ----------------
    buildPalette() {
      const host = $('palette');
      host.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.group) { this.group = b.dataset.group; this.renderPalette(); return; }
        if (b.dataset.mn) this.insertInstr(b.dataset.mn);
        if (b.dataset.tool) this.tool(b.dataset.tool);
      });
      host.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('button[data-mn]');
        if (b && e.button === 0) this.paletteDrag(b.dataset.mn, e);
      });
      this.renderPalette();
    }
    renderPalette() {
      const prof = this.profile;
      const btn = (mn) => {
        const sp = PLC.spec(mn, prof);
        if (!sp || !PLC.allowed(mn, prof)) return '';
        return `<button class="ibtn" data-mn="${mn}" title="${esc(mn + ' — ' + sp.name + '\n' + sp.help)}">${ICON[mn] || ''}${mn}</button>`;
      };
      const groups = PLC.INSTR_GROUPS;
      const inGroup = Object.values(PLC.INSTR).filter((s) => s.group === this.group && s.mn !== 'OSR_ML' && (s.mn !== 'OSR' || true));
      const names = [...new Set(inGroup.map((s) => (s.display || s.mn)))].filter((mn) => PLC.allowed(mn, prof));
      $('palette').innerHTML = `
        <div class="pal-row">
          <button class="ibtn tool" data-tool="rung" title="Add a new rung below the selected one">＋ Rung</button>
          <button class="ibtn tool" data-tool="branch" title="Wrap the selected instruction in a branch (or insert a branch at the cursor)">⑂ Branch</button>
          <button class="ibtn tool" data-tool="leg" title="Add another leg to the selected branch">＋ Leg</button>
          <span class="lbl" style="margin-left:8px">Quick</span>
          ${QUICK.map(btn).join('')}
        </div>
        <div class="pal-row">
          <div class="pal-groups">${groups.map((gname) => `<button data-group="${gname}" class="${gname === this.group ? 'active' : ''}">${gname}</button>`).join('')}</div>
          <span class="pal-sep"></span>${names.map(btn).join('')}
        </div>`;
    }

    tool(t) {
      if (t === 'rung') this.addRung();
      if (t === 'branch') this.addBranch();
      if (t === 'leg') this.addLeg();
    }

    // ---------------- file tabs ----------------
    renderFileTabs() {
      const host = $('filetabs');
      const files = this.project.files.slice().sort((a, b) => a.num - b.num);
      host.innerHTML = files.map((f) => `<button class="ft${f.num === this.app.fileNum ? ' active' : ''}" data-f="${f.num}" title="Program file ${f.num}">LAD ${f.num} – ${esc(f.name)}</button>`).join('') +
        `<button class="btn small ghost" id="btnAddFile" title="Add a subroutine program file">＋ Subroutine file</button>` +
        (this.app.fileNum !== 2 ? `<button class="btn small ghost" id="btnFileProps">Rename / delete…</button>` : '');
      host.onclick = (e) => {
        const b = e.target.closest('[data-f]');
        if (b) { this.app.fileNum = +b.dataset.f; this.sel = {}; this.app.render(); return; }
        if (e.target.id === 'btnAddFile') this.addFile();
        if (e.target.id === 'btnFileProps') this.fileProps();
      };
    }
    addFile() {
      if (!this.guardEdit()) return;
      let n = 3;
      while (this.project.files.some((f) => f.num === n)) n++;
      if (n > this.profile.maxProgFile) return this.app.toast(`This controller allows program files up to ${this.profile.maxProgFile}`);
      const name = prompt(`Name for program file LAD ${n}:`, 'SUB' + n);
      if (name === null) return;
      this.change(() => { this.project.files.push({ num: n, name: (name || 'SUB' + n).toUpperCase().slice(0, 10), rungs: [{ comment: '', items: [{ t: 'I', mn: 'SBR', ops: [] }] }] }); });
      this.app.fileNum = n;
      this.app.render();
    }
    fileProps() {
      if (!this.guardEdit()) return;
      const f = this.file;
      const v = prompt(`Rename LAD ${f.num}, or type DELETE to remove it:`, f.name);
      if (v === null) return;
      if (v.trim().toUpperCase() === 'DELETE') {
        this.change(() => { this.project.files = this.project.files.filter((x) => x !== f); });
        this.app.fileNum = 2;
      } else this.change(() => { f.name = v.toUpperCase().slice(0, 10) || f.name; });
      this.app.render();
    }

    // ---------------- undo ----------------
    snapshot() { return JSON.stringify({ files: this.project.files, desc: this.project.desc }); }
    change(fn, keepSel) {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
      fn();
      if (!keepSel) { /* selection objects remain valid (in-place edits) */ }
      this.app.programChanged();
    }
    undo() {
      if (!this.guardEdit() || !this.undoStack.length) return;
      this.redoStack.push(this.snapshot());
      this.restore(this.undoStack.pop());
    }
    redo() {
      if (!this.guardEdit() || !this.redoStack.length) return;
      this.undoStack.push(this.snapshot());
      this.restore(this.redoStack.pop());
    }
    restore(s) {
      const o = JSON.parse(s);
      this.project.files = o.files;
      this.project.desc = o.desc || {};
      this.sel = {};
      if (!this.project.files.some((f) => f.num === this.app.fileNum)) this.app.fileNum = 2;
      this.app.programChanged();
    }
    resetHistory() { this.undoStack = []; this.redoStack = []; }

    guardEdit() {
      if (this.app.engine.mode === 'PROGRAM') return true;
      this.app.toast('Switch to PROGRAM mode to edit the program');
      return false;
    }

    // ---------------- structure edits ----------------
    // Where does an insert go? Returns {series, index, rung}.
    insertPoint() {
      const s = this.sel;
      const rungs = this.file.rungs;
      if (s.kind === 'gap') return { series: s.series, index: s.index, rung: s.rung };
      if (s.kind === 'instr' || s.kind === 'branch') return { series: s.info.series, index: s.info.index + 1, rung: s.info.rung };
      if (s.kind === 'rung' && rungs[s.rung]) return { series: rungs[s.rung].items, index: rungs[s.rung].items.length, rung: s.rung };
      // default: end of last rung (create one if the last is not empty)
      if (!rungs.length) rungs.push({ comment: '', items: [] });
      const last = rungs[rungs.length - 1];
      return { series: last.items, index: last.items.length, rung: rungs.length - 1 };
    }

    newNode(mn) {
      const sp = PLC.spec(mn, this.profile);
      const ops = sp.ops.map((o) => {
        if (o[1] === 'tb') return this.profile.timeBases.includes(1) ? '1.0' : String(this.profile.timeBases[0]);
        if (['pre', 'acc', 'pos'].includes(o[1])) return '0';
        if (o[1] === 'len') return '1';
        if (o[1] === 'mask') return '0FFFFh';
        return '?';
      });
      return { t: 'I', mn: sp.display || sp.mn, ops };
    }

    insertInstr(mn, at) {
      if (!this.guardEdit()) return;
      const p = at || this.insertPoint();
      const node = this.newNode(mn);
      this.change(() => { p.series.splice(p.index, 0, node); });
      this.sel = { kind: 'instr', node, info: { series: p.series, index: p.index, rung: p.rung } };
      this.app.render();
      const sp = PLC.spec(mn, this.profile);
      if (sp.ops.length) requestAnimationFrame(() => this.editOperand(node, 0));
    }

    addRung(atIndex) {
      if (!this.guardEdit()) return;
      const rungs = this.file.rungs;
      let idx = atIndex;
      if (idx === undefined) {
        const s = this.sel;
        idx = s.kind === 'rung' ? s.rung + 1 : s.info ? s.info.rung + 1 : s.kind === 'gap' ? s.rung + 1 : rungs.length;
      }
      const r = { comment: '', items: [] };
      this.change(() => rungs.splice(idx, 0, r));
      this.sel = { kind: 'gap', series: r.items, index: 0, rung: idx };
      this.app.render();
    }

    addBranch() {
      if (!this.guardEdit()) return;
      const s = this.sel;
      if (s.kind === 'instr' || s.kind === 'branch') {
        const node = s.node;
        const { series, index } = s.info;
        const b = { t: 'B', legs: [[node], []] };
        this.change(() => series.splice(index, 1, b));
        this.sel = { kind: 'gap', series: b.legs[1], index: 0, rung: s.info.rung };
      } else {
        const p = this.insertPoint();
        const b = { t: 'B', legs: [[], []] };
        this.change(() => p.series.splice(p.index, 0, b));
        this.sel = { kind: 'gap', series: b.legs[0], index: 0, rung: p.rung };
      }
      this.app.render();
      this.app.toast('Branch added — click inside a leg, then pick instructions to put in it');
    }

    // Find the branch that owns a series (for "add leg" from inside a leg).
    findBranchOf(series, items) {
      let found = null;
      PLC.walkSeries(items, (n) => { if (n.t === 'B' && n.legs.includes(series)) found = n; }, []);
      return found;
    }
    addLeg() {
      if (!this.guardEdit()) return;
      const s = this.sel;
      let b = s.kind === 'branch' ? s.node : null;
      if (!b && (s.kind === 'gap' || s.kind === 'instr')) {
        const series = s.kind === 'gap' ? s.series : s.info.series;
        for (const r of this.file.rungs) { b = this.findBranchOf(series, r.items); if (b) break; }
      }
      if (!b) return this.app.toast('Select a branch (click its left edge) or click inside a branch leg first');
      const leg = [];
      this.change(() => b.legs.push(leg));
      this.sel = { kind: 'gap', series: leg, index: 0, rung: s.rung !== undefined ? s.rung : s.info.rung };
      this.app.render();
    }

    deleteSel() {
      if (!this.guardEdit()) return;
      const s = this.sel;
      const rungs = this.file.rungs;
      if (s.kind === 'instr' || s.kind === 'branch') {
        const { series, index, rung } = s.info;
        this.change(() => { series.splice(index, 1); this.cleanup(rungs[rung].items); });
        this.sel = { kind: 'gap', series, index: Math.min(index, series.length), rung };
      } else if (s.kind === 'rung') {
        if (!rungs[s.rung]) return;
        this.change(() => { rungs.splice(s.rung, 1); if (!rungs.length) rungs.push({ comment: '', items: [] }); });
        this.sel = { kind: 'rung', rung: Math.min(s.rung, rungs.length - 1) };
      } else if (s.kind === 'gap' && s.series.length === 0) {
        // empty leg → remove the leg
        const r = rungs[s.rung];
        const b = r && this.findBranchOf(s.series, r.items);
        if (b) { this.change(() => { b.legs.splice(b.legs.indexOf(s.series), 1); this.cleanup(r.items); }); this.sel = { kind: 'rung', rung: s.rung }; }
      }
      this.app.render();
    }

    // Unwrap branches with a single leg; drop branches with no legs.
    cleanup(series) {
      for (let i = 0; i < series.length; i++) {
        const n = series[i];
        if (n.t !== 'B') continue;
        n.legs.forEach((l) => this.cleanup(l));
        if (n.legs.length === 0) { series.splice(i, 1); i--; }
        else if (n.legs.length === 1) { series.splice(i, 1, ...n.legs[0]); i--; }
      }
    }

    moveRung(delta) {
      if (!this.guardEdit()) return;
      const s = this.sel;
      if (s.kind !== 'rung') return;
      const rungs = this.file.rungs;
      const j = s.rung + delta;
      if (j < 0 || j >= rungs.length) return;
      this.change(() => { const [r] = rungs.splice(s.rung, 1); rungs.splice(j, 0, r); });
      this.sel = { kind: 'rung', rung: j };
      this.app.render();
    }

    copy() {
      const s = this.sel;
      if (s.kind === 'rung') this.clip = { kind: 'rung', data: PLC.clone(this.file.rungs[s.rung]) };
      else if (s.kind === 'instr' || s.kind === 'branch') this.clip = { kind: 'node', data: PLC.clone(s.node) };
      else return;
      this.app.toast('Copied');
    }
    cut() { this.copy(); if (this.clip) this.deleteSel(); }
    paste() {
      if (!this.guardEdit() || !this.clip) return;
      if (this.clip.kind === 'rung') {
        const s = this.sel;
        const idx = s.kind === 'rung' ? s.rung + 1 : s.info ? s.info.rung + 1 : this.file.rungs.length;
        const r = PLC.clone(this.clip.data);
        this.change(() => this.file.rungs.splice(idx, 0, r));
        this.sel = { kind: 'rung', rung: idx };
      } else {
        const p = this.insertPoint();
        const n = PLC.clone(this.clip.data);
        this.change(() => p.series.splice(p.index, 0, n));
        this.sel = { kind: n.t === 'B' ? 'branch' : 'instr', node: n, info: { series: p.series, index: p.index, rung: p.rung } };
      }
      this.app.render();
    }

    // ---------------- rendering ----------------
    render() {
      this.closeOpEditor();
      this.renderFileTabs();
      const host = $('ladder');
      const wrap = $('ladderWrap');
      const app = this.app;
      const editable = app.engine.mode === 'PROGRAM';
      const errs = new Map();
      if (app.compileResult) for (const e of app.compileResult.errors) if (e.node && e.file === this.file.num) {
        if (!errs.has(e.node)) errs.set(e.node, []);
        errs.get(e.node).push(e.msg);
      }
      const running = app.engine.mode === 'RUN' || app.engine.mode === 'TEST';
      const hint = wrap.querySelector('.edit-hint');
      if (hint) hint.remove();
      if (!editable) wrap.insertAdjacentHTML('afterbegin', `<div class="edit-hint">${app.engine.mode === 'FAULT' ? 'Processor FAULTED — clear the fault to edit.' : 'Online — the program is running. Switch to <b>PROGRAM</b> to edit.'} Green = energised / true.</div>`);
      const opts = {
        rungs: this.file.rungs,
        profile: this.profile,
        dt: app.engine.dt,
        desc: this.project.desc,
        errors: errs,
        recs: running && app.engine.compiled ? app.engine.compiled.recs : null,
        powered: true,
        editable,
        sel: this.sel,
        width: wrap.clientWidth - 4,
        showEnd: true,
        on: {
          instr: (node, info, ev, opIdx) => {
            this.sel = { kind: 'instr', node, info };
            this.app.render();
            if (editable && opIdx !== null && ev.detail === 1 && this._lastClickNode === node) this.editOperand(node, opIdx);
            this._lastClickNode = node;
          },
          instrDbl: (node, info, ev, opIdx) => { if (editable) this.editOperand(node, opIdx || 0); },
          gap: (info) => { this.sel = Object.assign({ kind: 'gap' }, info); this._lastClickNode = null; this.app.render(); },
          branch: (node, info) => { this.sel = { kind: 'branch', node, info }; this.app.render(); },
          rung: (ri) => { this.sel = { kind: 'rung', rung: ri }; this._lastClickNode = null; this.app.render(); },
          rungDbl: (ri) => { this.sel = { kind: 'rung', rung: ri }; this.app.render(); const ta = $('rungText'); if (ta) ta.focus(); },
          background: () => { this.sel = {}; this.app.render(); },
          dragStart: editable ? (node, info, ev, svg) => this.nodeDrag(node, info, ev) : null,
        },
      };
      this.handle = PLC.renderLadder(host, opts);
      this.handle.update(running);
      this.renderProps();
    }

    liveUpdate() {
      if (this.handle) this.handle.update(this.app.engine.mode === 'RUN' || this.app.engine.mode === 'TEST');
      this.updatePropValues();
    }

    // ---------------- operand editor ----------------
    editOperand(node, k) {
      if (!this.guardEdit()) return;
      this.closeOpEditor();
      const sp = PLC.spec(node.mn, this.profile);
      if (!sp || !sp.ops.length) return;
      k = Math.max(0, Math.min(k, sp.ops.length - 1));
      const svg = this.handle && this.handle.svg;
      if (!svg) return;
      const idx = this.handle.nodes.findIndex((d) => d.node === node);
      const gEl = svg.querySelector(`[data-n="${idx}"]`);
      if (!gEl) return;
      const t = gEl.querySelector(`[data-op="${k}"]`) || gEl;
      const wrap = $('ladderWrap');
      const wr = wrap.getBoundingClientRect();
      const r = t.getBoundingClientRect();
      const inp = document.createElement('input');
      inp.className = 'op-editor';
      inp.value = node.ops[k] === '?' ? '' : node.ops[k];
      inp.placeholder = sp.ops[k][0];
      inp.setAttribute('list', 'addrList');
      inp.spellcheck = false;
      inp.autocomplete = 'off';
      const box = !!(sp.box || sp.ops.length > 1);
      const w = 140;
      inp.style.width = w + 'px';
      inp.style.left = Math.max(4, r.left - wr.left + wrap.scrollLeft + (box ? r.width - w + 6 : r.width / 2 - w / 2)) + 'px';
      inp.style.top = (r.top - wr.top + wrap.scrollTop - 6) + 'px';
      wrap.appendChild(inp);
      this.fillDatalist(sp.ops[k][1]);
      const err = document.createElement('div');
      err.className = 'op-err hidden';
      err.style.left = inp.style.left;
      err.style.top = (parseFloat(inp.style.top) + 34) + 'px';
      wrap.appendChild(err);
      this.opEditor = { inp, err, node, k };
      inp.focus();
      inp.select();
      const commit = (next) => {
        const v = inp.value.trim();
        if (!v) { this.closeOpEditor(); return; }
        try {
          const ref = PLC.compileOperand(this.app.engine.dt, this.profile, sp.ops[k][1], v, this.project);
          const text = ['pre', 'acc', 'len', 'pos'].includes(sp.ops[k][1]) ? String(ref.value) : ref.text;
          this.change(() => { node.ops[k] = text; });
          this.app.engine.applyNode(node);
          this.closeOpEditor();
          this.app.render();
          if (next !== 0 && k + next >= 0 && k + next < sp.ops.length) this.editOperand(node, k + next);
        } catch (e) {
          inp.classList.add('bad');
          err.textContent = e.message;
          err.classList.remove('hidden');
        }
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(sp.ops.length > 1 ? 1 : 0); }
        else if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1); }
        else if (e.key === 'Escape') { e.preventDefault(); this.closeOpEditor(); }
        e.stopPropagation();
      });
      inp.addEventListener('input', () => { inp.classList.remove('bad'); err.classList.add('hidden'); });
      inp.addEventListener('blur', () => setTimeout(() => { if (this.opEditor && this.opEditor.inp === inp) commit(0); }, 120));
    }
    closeOpEditor() {
      if (!this.opEditor) return;
      const { inp, err } = this.opEditor;
      this.opEditor = null;
      inp.remove();
      err.remove();
    }
    fillDatalist(type) {
      let dl = $('addrList');
      if (!dl) { dl = document.createElement('datalist'); dl.id = 'addrList'; document.body.appendChild(dl); }
      const seen = new Map();
      const add = (a, d) => { if (a && !seen.has(a)) seen.set(a, d || ''); };
      const desc = this.project.desc || {};
      const wantBit = type === 'bit';
      const wantElem = { tmr: 'T', ctr: 'C', ctl: 'R', res: 'TCR' }[type];
      for (const [a, d] of Object.entries(desc)) add(a, d);
      PLC.forEachInstr(this.project, (n) => n.ops.forEach((o) => { if (/[:\/]/.test(o)) add(o, desc[o]); }));
      for (const [a, v] of Object.entries(this.app.sceneIO())) add(a, v);
      const dt = this.app.engine.dt;
      const opts = [];
      for (const [a, d] of seen) {
        const r = dt.tryParse(a);
        if (!r) continue;
        if (wantBit && r.kind !== 'bit') continue;
        if (wantElem && (r.kind !== 'elem' || !wantElem.includes(dt.file(r.file).type))) continue;
        if (!wantBit && !wantElem && !['src', 'dst', 'mask', 'file'].includes(type)) continue;
        opts.push(`<option value="${esc(a)}">${esc(d)}</option>`);
      }
      dl.innerHTML = opts.join('');
    }

    // ---------------- drag & drop ----------------
    dragGeneric(label, ev, onDrop) {
      const sx = ev.clientX, sy = ev.clientY;
      let ghost = null, target = null;
      const move = (e) => {
        if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
        if (!ghost) {
          ghost = document.createElement('div');
          ghost.className = 'drag-ghost';
          ghost.textContent = label;
          document.body.appendChild(ghost);
        }
        ghost.style.left = e.clientX + 10 + 'px';
        ghost.style.top = e.clientY + 8 + 'px';
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const gp = el && el.closest && el.closest('[data-g]');
        if (target) target.classList.remove('drop');
        target = gp || null;
        if (target) target.classList.add('drop');
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (ghost) ghost.remove();
        if (ghost && target && this.handle) {
          this._suppressClick = true;
          setTimeout(() => { this._suppressClick = false; }, 50);
          onDrop(this.handle.gaps[+target.dataset.g]);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }
    paletteDrag(mn, ev) {
      if (this.app.engine.mode !== 'PROGRAM') return;
      this.dragGeneric(mn, ev, (gap) => this.insertInstr(mn, gap));
    }
    nodeDrag(node, info, ev) {
      this.dragGeneric(node.mn + ' ' + (node.ops[0] || ''), ev, (gap) => {
        if (!gap) return;
        // Prevent dropping a node into itself (only possible for branches).
        const { series, index } = info;
        this.change(() => {
          series.splice(index, 1);
          let at = gap.index;
          if (gap.series === series && gap.index > index) at--;
          gap.series.splice(at, 0, node);
          this.cleanup(this.file.rungs[info.rung].items);
        });
        this.sel = { kind: 'instr', node, info: { series: gap.series, index: gap.series.indexOf(node), rung: gap.rung } };
        this.app.render();
      });
    }

    // ---------------- properties panel ----------------
    renderProps() {
      const host = $('props');
      const s = this.sel;
      const editable = this.app.engine.mode === 'PROGRAM';
      const dis = editable ? '' : 'disabled';
      if (s.kind === 'instr') {
        const n = s.node;
        const sp = PLC.spec(n.mn, this.profile);
        if (!sp) { host.innerHTML = `<h3>Instruction</h3><p>Unknown instruction ${esc(n.mn)}</p>`; return; }
        const errs = (this.app.compileResult ? this.app.compileResult.errors : []).filter((e) => e.node === n).map((e) => e.msg);
        const rows = sp.ops.map((o, k) => {
          let live = '';
          return `<label>${esc(o[0])}</label><div><input class="txt mono" data-k="${k}" value="${esc(n.ops[k])}" ${dis} spellcheck="false" list="addrList">${live}</div>`;
        }).join('');
        const bitOp = sp.ops.findIndex((o) => ['bit', 'tmr', 'ctr', 'ctl', 'res'].includes(o[1]));
        const addr = bitOp >= 0 ? n.ops[bitOp] : sp.ops.length ? n.ops[0] : '';
        const descRow = addr && addr !== '?' ? `<label>Description</label><input class="txt" id="propDesc" value="${esc(this.project.desc[addr] || '')}" placeholder="What is ${esc(addr)}?" ${dis}>` : '';
        host.innerHTML = `
          <h3><span class="grow">Instruction</span><button class="btn small ghost" id="propRef">Reference ↗</button></h3>
          <div class="prop-title"><code>${esc(n.mn)}</code> — ${esc(sp.name)}</div>
          <div class="prop-help">${esc(sp.help)}</div>
          <div class="prop-grid">${rows}${descRow}</div>
          <div id="propLive" class="prop-help mono" style="margin-top:8px"></div>
          ${errs.map((e) => `<div class="prop-err">⚠ ${esc(e)}</div>`).join('')}
          <div class="row" style="margin-top:8px">
            <button class="btn small" id="propBranch" ${dis}>⑂ Branch around</button>
            <button class="btn small" id="propCopy">Copy</button>
            <button class="btn small danger" id="propDel" ${dis}>Delete</button>
          </div>`;
        host.querySelectorAll('input[data-k]').forEach((inp) => {
          inp.addEventListener('focus', () => this.fillDatalist(sp.ops[+inp.dataset.k][1]));
          inp.addEventListener('change', () => {
            const k = +inp.dataset.k;
            try {
              const ref = PLC.compileOperand(this.app.engine.dt, this.profile, sp.ops[k][1], inp.value, this.project);
              const text = ['pre', 'acc', 'len', 'pos'].includes(sp.ops[k][1]) ? String(ref.value) : ref.text;
              this.change(() => { n.ops[k] = text; });
              this.app.engine.applyNode(n);
              this.app.render();
            } catch (e) { inp.classList.add('bad'); inp.title = e.message; this.app.toast(e.message); }
          });
        });
        const d = $('propDesc');
        if (d) d.addEventListener('change', () => this.setDesc(addr, d.value));
        $('propRef').onclick = () => this.app.learn.showReference(n.mn);
        $('propBranch').onclick = () => this.addBranch();
        $('propCopy').onclick = () => this.copy();
        $('propDel').onclick = () => this.deleteSel();
        this.updatePropValues();
        return;
      }
      if (s.kind === 'rung') {
        const r = this.file.rungs[s.rung];
        if (!r) { host.innerHTML = ''; return; }
        const text = PLC.rungText(r, PLC.liveOps(this.app.engine.dt, this.profile));
        host.innerHTML = `
          <h3>Rung ${String(s.rung).padStart(4, '0')}</h3>
          <label class="prop-help">Rung comment</label>
          <textarea class="txt" id="rungComment" rows="2" ${dis} placeholder="Explain what this rung does">${esc(r.comment || '')}</textarea>
          <label class="prop-help" style="display:block;margin-top:8px">Rung as text (RSLogix 500 format) — edit and press Apply</label>
          <textarea class="txt mono" id="rungText" rows="3" ${dis} spellcheck="false">${esc(text)}</textarea>
          <div class="prop-err" id="rungTextErr"></div>
          <div class="row" style="margin-top:6px">
            <button class="btn small primary" id="rtApply" ${dis}>Apply text</button>
            <button class="btn small" id="rtAbove" ${dis}>Insert rung above</button>
            <button class="btn small" id="rtBelow" ${dis}>Insert below</button>
          </div>
          <div class="row">
            <button class="btn small" id="rtUp" ${dis}>▲ Move up</button>
            <button class="btn small" id="rtDown" ${dis}>▼ Move down</button>
            <button class="btn small" id="rtCopy">Copy</button>
            <button class="btn small" id="rtPaste" ${dis}>Paste</button>
            <button class="btn small danger" id="rtDel" ${dis}>Delete rung</button>
          </div>`;
        $('rungComment').addEventListener('change', (e) => this.change(() => { r.comment = e.target.value; }));
        $('rtApply').onclick = () => {
          try {
            const parsed = PLC.parseRung($('rungText').value, this.profile);
            this.change(() => { r.items = parsed.items; });
            PLC.walkSeries(r.items, (n) => { if (n.t === 'I') this.app.engine.applyNode(n); }, []);
            this.app.render();
          } catch (e) { $('rungTextErr').textContent = e.message; }
        };
        $('rtAbove').onclick = () => this.addRung(s.rung);
        $('rtBelow').onclick = () => this.addRung(s.rung + 1);
        $('rtUp').onclick = () => this.moveRung(-1);
        $('rtDown').onclick = () => this.moveRung(1);
        $('rtCopy').onclick = () => this.copy();
        $('rtPaste').onclick = () => this.paste();
        $('rtDel').onclick = () => this.deleteSel();
        return;
      }
      if (s.kind === 'branch') {
        host.innerHTML = `<h3>Branch</h3><p class="prop-help">A branch is an OR: power flows through if <em>any</em> leg is true. It has ${s.node.legs.length} legs.</p>
          <div class="row"><button class="btn small" id="brLeg" ${dis}>＋ Add leg</button><button class="btn small" id="brCopy">Copy</button><button class="btn small danger" id="brDel" ${dis}>Delete branch</button></div>`;
        $('brLeg').onclick = () => this.addLeg();
        $('brCopy').onclick = () => this.copy();
        $('brDel').onclick = () => this.deleteSel();
        return;
      }
      if (s.kind === 'gap') {
        const empty = s.series.length === 0;
        host.innerHTML = `<h3>Insertion point</h3><p class="prop-help">Rung ${String(s.rung).padStart(4, '0')}. Click an instruction in the toolbar (or drag one here) to insert it at the blue cursor.${empty ? ' This is an empty branch leg — it acts as a short (always true). Press Delete to remove the leg.' : ''}</p>
          <div class="row"><button class="btn small" id="gpBranch" ${dis}>⑂ Insert branch here</button><button class="btn small" id="gpLeg" ${dis}>＋ Leg on this branch</button>${this.clip ? `<button class="btn small" id="gpPaste" ${dis}>Paste</button>` : ''}</div>`;
        $('gpBranch').onclick = () => this.addBranch();
        $('gpLeg').onclick = () => this.addLeg();
        if ($('gpPaste')) $('gpPaste').onclick = () => this.paste();
        return;
      }
      host.innerHTML = `<h3>Getting started</h3>
        <p class="prop-help">Click a <b>gap in a rung</b> (the wire) to place the cursor, then click an instruction like <code>XIC</code> or <code>OTE</code> in the toolbar and type its address. Click a rung number to edit the rung as text or add a comment.</p>
        <p class="prop-help">When you're ready, press <b>RUN</b> and use the machine panel below to test it. New to PLCs? Start with <a href="#" id="startL1">Lesson 1</a>.</p>`;
      const a = $('startL1');
      if (a) a.onclick = (e) => { e.preventDefault(); this.app.learn.openFirstLesson(); };
    }

    updatePropValues() {
      const el = $('propLive');
      const s = this.sel;
      if (!el || s.kind !== 'instr') return;
      const dt = this.app.engine.dt;
      const parts = [];
      for (const o of s.node.ops) {
        const r = dt.tryParse(o);
        if (!r) continue;
        if (r.kind === 'bit') parts.push(`${r.text} = ${dt.getBit(r)}`);
        else if (r.kind === 'word' || r.kind === 'float') parts.push(`${r.text} = ${dt.getWord(r)}`);
        else if (r.kind === 'elem') {
          const f = dt.file(r.file);
          const d = f.data, o3 = r.elem * 3;
          const names = Object.entries(PLC.SUB_BITS[f.type]).filter(([, b]) => (d[o3] >> b) & 1).map(([nm]) => nm);
          const w = PLC.SUB_WORDS[f.type];
          const [w1, w2] = Object.keys(w);
          parts.push(`${r.text}: ${w1} ${d[o3 + 1]}  ${w2} ${d[o3 + 2]}  [${names.join(' ') || '—'}]`);
        }
      }
      const txt = parts.join('   ');
      if (el.textContent !== txt) el.textContent = txt;
    }

    setDesc(addr, text) {
      this.change(() => {
        if (text.trim()) this.project.desc[addr] = text.trim();
        else delete this.project.desc[addr];
      });
      this.app.render();
    }

    // ---------------- keyboard ----------------
    bindKeys() {
      document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
        if (document.querySelector('.modal-back')) return;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
        if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
        if (mod && e.key.toLowerCase() === 'c') { this.copy(); return; }
        if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); this.cut(); return; }
        if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') { if (this.sel.kind) { e.preventDefault(); this.deleteSel(); } return; }
        if (e.key === 'Enter' && this.sel.kind === 'instr') { e.preventDefault(); this.editOperand(this.sel.node, 0); return; }
        if (e.key === 'Escape') { this.sel = {}; this.app.render(); }
      });
    }
  }

  PLC.Editor = Editor;
})(typeof window !== 'undefined' ? window : globalThis);
