/*
 * PLCsim application shell: project slots, persistence, mode control, the
 * animation / simulation loop, and header controls.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});
  const esc = (s) => PLC.ladderEsc(s);
  const $ = (id) => document.getElementById(id);

  // localStorage can throw (private mode, blocked storage) — never let that break the app.
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const KEY = 'plcsim.v1.';

  const DEMO = [
    { comment: 'Motor start/stop with seal-in. START is normally open, STOP is normally closed (so its input is ON until pressed).', text: 'BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC I:0/2 OTE O:0/0' },
    { comment: 'Pilot lights', text: 'BST XIC O:0/0 OTE O:0/1 NXB XIO O:0/0 OTE O:0/2 BND' },
    { comment: 'Overload light', text: 'XIO I:0/2 OTE O:0/3' },
  ];

  class App {
    constructor() {
      this.sel = {};
      this.fileNum = 2;
      this.speed = 1;
      this.lastGrade = null;
      this.compileResult = null;
      this.progress = this.loadProgress();
      this.slot = store.get(KEY + 'slot') || 'sandbox';
      let project = this.readSlot(this.slot);
      if (!project) { this.slot = 'sandbox'; project = this.readSlot('sandbox') || this.demoProject(); }
      this.project = project;
      this.engine = new PLC.Engine(project);
      this.bindEngine();

      this.editor = new PLC.Editor(this);
      this.panels = new PLC.Panels(this);
      this.io = new PLC.IOPanel(this);
      this.learn = new PLC.Learn(this);
      this.initHeader();
      this.applyTheme(store.get(KEY + 'theme'));

      this.io.load(project.scene || 'motor');
      this.programChanged(true);
      this.learn.render();
      this.panels.render();
      this.updateHeader();
      this.loop();
      window.addEventListener('resize', () => { clearTimeout(this._rs); this._rs = setTimeout(() => this.editor.render(), 120); });
      window.addEventListener('beforeunload', () => this.save());
      setInterval(() => { if (this.engine.mode === 'RUN') this.save(); }, 5000);
      if (!store.get(KEY + 'welcomed')) { store.set(KEY + 'welcomed', '1'); this.showHelp(true); }
    }

    // ---------------- projects & slots ----------------
    demoProject() {
      const p = PLC.newProject(PLC.DEFAULT_PROFILE);
      p.name = 'My project';
      p.scene = 'motor';
      const prof = PLC.getProfile(p.profileId);
      p.files[0].rungs = DEMO.map((d) => Object.assign(PLC.parseRung(d.text, prof), { comment: d.comment }));
      p.desc = { 'I:0/0': 'START PB', 'I:0/1': 'STOP PB (N.C.)', 'I:0/2': 'Overload OK', 'O:0/0': 'Motor M1', 'O:0/1': 'Running light', 'O:0/2': 'Stopped light', 'O:0/3': 'Overload light' };
      return p;
    }
    readSlot(slot) {
      const raw = store.get(KEY + 'slot.' + slot);
      if (!raw) return null;
      try {
        const p = JSON.parse(raw);
        if (!p || !Array.isArray(p.files)) return null;
        p.desc = p.desc || {};
        return p;
      } catch (e) { return null; }
    }
    save() {
      if (!this.project) return;
      const p = Object.assign({}, this.project, { data: this.engine.dt.sparse(['I', 'O']) });
      store.set(KEY + 'slot.' + this.slot, JSON.stringify(p));
      store.set(KEY + 'slot', this.slot);
    }
    saveSoon() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.save(), 400); }

    // Switch the editor to another project slot.
    openSlot(slot, make, fresh) {
      this.save();
      if (this.engine.mode !== 'PROGRAM') this.setMode('PROGRAM');
      let p = fresh ? null : this.readSlot(slot);
      if (!p) p = make();
      this.slot = slot;
      this.setProject(p);
      this.save();
    }
    setProject(p) {
      this.project = p;
      p.desc = p.desc || {};
      this.engine.load(p);
      this.fileNum = 2;
      this.sel = {};
      this.editor.resetHistory();
      this.editor.renderPalette();
      this.io.load(p.scene || 'trainer');
      this.programChanged(true);
      this.updateHeader();
      this.learn.render();
    }

    // Build a project from lesson/challenge content ({rungs, subs, comments, desc}).
    makeProject(spec, scene, name) {
      const p = PLC.buildContentProject(Object.assign({}, spec, { name }), this.engine.profile.id);
      p.scene = scene || 'trainer';
      return p;
    }

    loadExample(ex, lesson) {
      this.openSlot('ex:' + ex.id, () => this.makeProject(ex, ex.scene, 'Example: ' + ex.title), true);
      this.toast(`Loaded "${ex.title}". Press RUN to try it.`);
      if (ex.notes) this.toastLong(ex.notes);
      void lesson;
    }
    startChallenge(c, fresh, useSolution) {
      this.openSlot('ch:' + c.id, () => this.makeProject({
        rungs: useSolution ? c.solution : c.starter || [],
        subs: useSolution ? c.solutionSubs : c.starterSubs,
        desc: c.io,
      }, c.scene, 'Challenge: ' + c.title), fresh);
      this.panels.show('tests');
    }
    runChallengeTests(c) {
      const prof = this.engine.profile;
      if (this.slot !== 'ch:' + c.id) this.startChallenge(c);
      const test = PLC.remapTest(c.test, prof);
      const labels = Object.assign({}, this.descAll(), PLC.remapKeys(c.io || {}, prof));
      const result = PLC.grade(this.project, this.engine.dt, test, labels);
      this.lastGrade = { id: c.id, title: c.title, result };
      if (result.pass) { this.progress.challenges[c.id] = Date.now(); this.saveProgress(); this.toast('✔ Challenge passed!'); }
      this.panels.show('tests');
    }

    // ---------------- progress ----------------
    loadProgress() {
      try { const p = JSON.parse(store.get(KEY + 'progress') || '{}'); return { lessons: p.lessons || {}, challenges: p.challenges || {} }; }
      catch (e) { return { lessons: {}, challenges: {} }; }
    }
    saveProgress() { store.set(KEY + 'progress', JSON.stringify(this.progress)); }
    markLesson(id, on) { if (on) this.progress.lessons[id] = Date.now(); else delete this.progress.lessons[id]; this.saveProgress(); }

    // ---------------- descriptions ----------------
    sceneIO() { return this.io ? this.io.labels() : {}; }
    descAll() { return Object.assign({}, this.sceneIO(), this.project.desc || {}); }

    // ---------------- program changes ----------------
    programChanged(initial) {
      this.compileResult = this.engine.compile();
      const lint = PLC.lint(this.project, this.engine.dt, this.engine.profile, this.compileResult);
      this.lintResult = lint;
      const nErr = lint.issues.filter((i) => i.sev === 'error').length, nWarn = lint.issues.length - nErr;
      const badge = $('verifyBadge');
      badge.textContent = nErr ? nErr : nWarn;
      badge.className = 'badge' + (nErr ? ' bad' : nWarn ? '' : ' good');
      if (!initial) this.saveSoon();
      this.render();
    }
    verify(quiet) {
      const lint = PLC.lint(this.project, this.engine.dt, this.engine.profile);
      this.lintResult = lint;
      if (!quiet) {
        this.panels.show('verify');
        const nErr = lint.issues.filter((i) => i.sev === 'error').length;
        this.toast(nErr ? `${nErr} error${nErr > 1 ? 's' : ''} — see the Verify tab` : lint.issues.length ? 'No errors (see warnings)' : '✓ Verified: no errors');
      }
      return lint;
    }
    render() {
      this.editor.render();
      if (this.panels.tab !== 'data') this.panels.render();
      else this.panels.render();
    }

    focusNode(fileNum, rung, node) {
      this.fileNum = fileNum;
      if (node) {
        let info = null;
        const f = this.project.files.find((x) => x.num === fileNum);
        if (f && f.rungs[rung]) PLC.walkSeries(f.rungs[rung].items, (n, p) => {
          if (n === node) {
            // locate parent series
            const find = (series) => { const i = series.indexOf(n); if (i >= 0) return { series, index: i }; for (const x of series) if (x.t === 'B') for (const l of x.legs) { const r = find(l); if (r) return r; } return null; };
            info = find(f.rungs[rung].items);
          }
          void p;
        }, []);
        this.sel = info ? { kind: n2k(node), node, info: Object.assign(info, { rung }) } : { kind: 'rung', rung };
      } else this.sel = { kind: 'rung', rung };
      this.editor.render();
      const el = document.querySelector('.ladder-svg .ins.sel, .ladder-svg .rung.sel');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      function n2k(n) { return n.t === 'B' ? 'branch' : 'instr'; }
    }

    // ---------------- modes ----------------
    setMode(mode) {
      const r = this.engine.setMode(mode);
      if (!r.ok) {
        this.programChanged();
        this.panels.show('verify');
        this.toast(r.errors && r.errors[0] ? 'Cannot run: ' + r.errors[0].msg : 'Cannot change mode');
      }
      this.sel = mode === 'PROGRAM' ? this.sel : {};
      this.updateHeader();
      this.editor.render();
      return r;
    }
    bindEngine() {
      this.engine.on((type) => {
        if (type === 'fault') { this.updateHeader(); this.editor.render(); this.panels.render(); }
      });
    }

    updateHeader() {
      const e = this.engine;
      document.querySelectorAll('#modeSeg button').forEach((b) => {
        const on = b.dataset.mode === e.mode || (b.dataset.mode === 'PROGRAM' && e.mode === 'FAULT');
        b.className = on ? 'active ' + (b.dataset.mode === 'RUN' ? 'run' : 'prog') : '';
      });
      if (e.mode === 'TEST') document.querySelector('#modeSeg [data-mode=PROGRAM]').className = '';
      $('modeLed').className = 'mode-led ' + ({ RUN: 'run', FAULT: 'fault', TEST: 'test' }[e.mode] || '');
      $('btnStep').classList.toggle('active', e.mode === 'TEST');
      const fb = $('faultBar');
      if (e.mode === 'FAULT' && e.fault) {
        fb.classList.remove('hidden');
        $('faultCode').textContent = `MAJOR FAULT ${e.fault.code.toString(16).toUpperCase().padStart(4, '0')}h`;
        $('faultMsg').textContent = e.fault.msg;
      } else fb.classList.add('hidden');
      const chip = $('slotChip');
      if (this.slot === 'sandbox') chip.classList.add('hidden');
      else {
        chip.classList.remove('hidden');
        chip.innerHTML = `<span class="nm" title="${esc(this.project.name || this.slot)}">${esc(this.project.name || this.slot)}</span><button id="chipBack">back to my project</button>`;
        $('chipBack').onclick = () => this.openSlot('sandbox', () => this.demoProject());
      }
      const ps = $('profileSel');
      if (ps.value !== e.profile.id) ps.value = e.profile.id;
      this.updateStatus();
    }
    updateStatus() {
      const e = this.engine;
      const t = e.mode === 'PROGRAM' ? 'Offline edit' : e.mode === 'FAULT' ? 'Faulted' : `Scan ${e.scanCount} · ${(e.simTime / 1000).toFixed(2)} s`;
      const st = $('statusTxt');
      if (st.textContent !== t) st.textContent = t;
    }

    // ---------------- controller change ----------------
    changeProfile(id) {
      if (id === this.engine.profile.id) return;
      const from = this.engine.profile, to = PLC.getProfile(id);
      if (this.engine.mode !== 'PROGRAM') this.setMode('PROGRAM');
      const firstSlot = (prof, kind) => { const s = prof.slots.find((x) => (kind === 'I' ? x.inputs : x.outputs) > 0); return s ? s.slot : 0; };
      const map = (text) => String(text).replace(/\b([IO]):(\d+)/g, (m, L, s) => (+s === firstSlot(from, L) ? `${L}:${firstSlot(to, L)}` : m));
      this.editor.change(() => {
        PLC.forEachInstr(this.project, (n) => { n.ops = n.ops.map(map); });
        const d = {};
        for (const [k, v] of Object.entries(this.project.desc || {})) d[map(k)] = v;
        this.project.desc = d;
      });
      const data = this.engine.dt.sparse(['I', 'O']);
      this.project.profileId = to.id;
      this.project.data = data;
      this.engine.load(this.project);
      this.project.data = null;
      this.editor.renderPalette();
      this.io.load(this.project.scene || 'trainer');
      this.programChanged();
      this.learn.render();
      this.updateHeader();
      const errs = this.compileResult.errors.length;
      this.toast(`Controller: ${to.short}${errs ? ` — ${errs} address/instruction error${errs > 1 ? 's' : ''} to fix (see Verify)` : ''}`);
    }

    // ---------------- header ----------------
    initHeader() {
      const ps = $('profileSel');
      const fams = [...new Set(PLC.PROFILES.map((p) => p.family))];
      ps.innerHTML = fams.map((f) => `<optgroup label="${esc(f)}">${PLC.PROFILES.filter((p) => p.family === f).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
      ps.value = this.engine.profile.id;
      ps.onchange = () => this.changeProfile(ps.value);
      document.querySelectorAll('#modeSeg button').forEach((b) => b.onclick = () => this.setMode(b.dataset.mode));
      $('btnStep').onclick = () => {
        const r = this.engine.singleScan();
        if (!r.ok) { this.programChanged(); this.panels.show('verify'); this.toast('Cannot scan: ' + (r.errors[0] ? r.errors[0].msg : '')); }
        this.updateHeader();
        this.editor.render();
        this.panels.tick(true);
      };
      $('speedSel').onchange = (e) => { this.speed = +e.target.value; };
      $('btnVerify').onclick = () => this.verify();
      $('btnClearFault').onclick = () => { this.engine.clearFault(); this.updateHeader(); this.editor.render(); };
      $('btnTheme').onclick = () => {
        const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        this.applyTheme(cur === 'dark' ? 'light' : 'dark');
      };
      $('btnHelp').onclick = () => this.showHelp();
      $('btnSide').onclick = () => this.openSide(true);
      $('btnSideClose').onclick = () => $('layout').classList.remove('side-open');
      const fm = $('fileMenu');
      $('btnFile').onclick = (e) => { e.stopPropagation(); fm.classList.toggle('hidden'); };
      document.addEventListener('click', () => fm.classList.add('hidden'));
      fm.onclick = (e) => {
        const b = e.target.closest('button[data-act]');
        if (b) this.fileAction(b.dataset.act);
      };
      $('fileInput').onchange = (e) => this.openFile(e.target.files[0]);
    }
    openSide(toggle) {
      const L = $('layout');
      if (toggle) L.classList.toggle('side-open'); else L.classList.add('side-open');
    }
    applyTheme(t) {
      if (t === 'dark' || t === 'light') { document.documentElement.dataset.theme = t; store.set(KEY + 'theme', t); }
      if (this.editor) setTimeout(() => { this.io.load(this.io.sceneId); this.editor.render(); }, 0);
    }

    fileAction(act) {
      if (act === 'new') {
        if (!confirm('Start a new, empty program in your free-play project? (Save it to a file first if you want to keep it.)')) return;
        this.openSlot('sandbox', () => { const p = PLC.newProject(this.engine.profile.id); p.name = 'My project'; p.scene = 'trainer'; return p; }, true);
      }
      if (act === 'open') $('fileInput').click();
      if (act === 'save') this.download(`${(this.project.name || 'program').replace(/[^\w\- ]+/g, '').trim() || 'program'}.plcsim.json`, JSON.stringify(Object.assign({}, this.project, { data: this.engine.dt.sparse(['I', 'O']) }), null, 1), 'application/json');
      if (act === 'text') this.textDialog();
      if (act === 'exportText') this.download('program.txt', this.programText(), 'text/plain');
      if (act === 'sandbox') this.openSlot('sandbox', () => this.demoProject());
      if (act === 'resetProgress' && confirm('Clear all lesson and challenge progress?')) { this.progress = { lessons: {}, challenges: {} }; this.saveProgress(); this.learn.render(); }
    }
    download(name, text, type) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    programText() {
      const live = PLC.liveOps(this.engine.dt, this.engine.profile);
      const lines = [`; PLCsim program — ${this.engine.profile.name}`];
      for (const f of this.project.files) {
        lines.push(`; LAD ${f.num} - ${f.name}`);
        f.rungs.forEach((r) => {
          if (r.comment) r.comment.split('\n').forEach((c) => lines.push('; ' + c));
          lines.push(PLC.rungText(r, live));
        });
      }
      const d = Object.entries(this.project.desc || {});
      if (d.length) { lines.push('; Descriptions'); d.forEach(([a, t]) => lines.push(`; ${a} = ${t}`)); }
      return lines.join('\n') + '\n';
    }
    openFile(file) {
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        const text = String(rd.result);
        try {
          if (/^\s*\{/.test(text)) {
            const p = JSON.parse(text);
            if (!p.files) throw new Error('Not a PLCsim project file');
            p.desc = p.desc || {};
            if (!PLC.PROFILES.some((x) => x.id === p.profileId)) p.profileId = PLC.DEFAULT_PROFILE;
            this.openSlot('sandbox', () => p, true);
          } else {
            this.importText(text, true);
          }
          this.toast('Opened ' + file.name);
        } catch (e) { alert('Could not open that file: ' + e.message); }
        $('fileInput').value = '';
      };
      rd.readAsText(file);
    }
    // Parse a whole-program text listing into the current program file.
    importText(text, replaceAll) {
      const prof = this.engine.profile;
      const files = [];
      let cur = { num: 2, name: 'MAIN', rungs: [] };
      let comment = [];
      const desc = {};
      for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        let m;
        if ((m = /^;\s*LAD\s+(\d+)\s*-\s*(\S+)/i.exec(line))) {
          if (cur.rungs.length || files.length) files.push(cur);
          cur = { num: +m[1], name: m[2], rungs: [] };
          comment = [];
          continue;
        }
        if ((m = /^;\s*([A-Z]\d*:[\w./]+)\s*=\s*(.*)$/i.exec(line))) { desc[m[1].toUpperCase()] = m[2]; continue; }
        if (line.startsWith(';') || line.startsWith('#') && !/^#[A-Z]/.test(line)) {
          if (!/^;\s*(PLCsim|Descriptions)/i.test(line)) comment.push(line.replace(/^[;#]\s?/, ''));
          continue;
        }
        const r = PLC.parseRung(line, prof);
        r.comment = comment.join('\n');
        comment = [];
        cur.rungs.push(r);
      }
      files.push(cur);
      if (!files.some((f) => f.num === 2)) throw new Error('No MAIN program (LAD 2) found');
      const apply = () => {
        this.project.files = files.map((f) => Object.assign(f, { rungs: f.rungs.length ? f.rungs : [{ comment: '', items: [] }] }));
        Object.assign(this.project.desc, desc);
      };
      if (replaceAll) this.editor.change(apply); else apply();
      PLC.forEachInstr(this.project, (n) => this.engine.applyNode(n));
      this.fileNum = 2;
      this.sel = {};
      this.programChanged();
    }
    textDialog() {
      const m = this.modal('Program as text', `<p class="prop-help">One rung per line in RSLogix 500 text format. Lines starting with <code>;</code> are rung comments. <code>; LAD 3 - NAME</code> starts a subroutine file. You can paste this into (or copy it out of) the ASCII rung editor style used by RSLogix 500.</p>
        <textarea class="txt" id="progText" spellcheck="false"></textarea><div class="prop-err" id="progTextErr"></div>`,
      [{ label: 'Cancel' }, { label: 'Replace program', primary: true, fn: () => {
        if (this.engine.mode !== 'PROGRAM') { this.toast('Switch to PROGRAM mode first'); return false; }
        try { this.importText($('progText').value, true); return true; }
        catch (e) { $('progTextErr').textContent = e.message; return false; }
      } }]);
      $('progText').value = this.programText();
      void m;
    }

    modal(title, html, buttons) {
      const back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = `<div class="modal" role="dialog" aria-label="${esc(title)}"><header>${esc(title)}<button class="btn ghost small x">✕</button></header><div class="mbody">${html}</div><footer>${(buttons || [{ label: 'Close', primary: true }]).map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</footer></div>`;
      document.body.appendChild(back);
      const close = () => back.remove();
      back.querySelector('.x').onclick = close;
      back.addEventListener('click', (e) => { if (e.target === back) close(); });
      back.querySelectorAll('footer button').forEach((b) => b.onclick = () => {
        const bt = (buttons || [])[+b.dataset.i];
        if (bt && bt.fn && bt.fn() === false) return;
        close();
      });
      const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
      document.addEventListener('keydown', onKey);
      return back;
    }
    showHelp(first) {
      this.modal(first ? 'Welcome to PLCsim' : 'How to use PLCsim', `
        <p><b>PLCsim</b> is a practice simulator for Allen-Bradley–style ladder logic as programmed with RSLogix 500 on the MicroLogix 1000 (and other MicroLogix / SLC 500 controllers — pick one in the controller menu).</p>
        <h4>Quick start</h4>
        <ol>
          <li>New to PLCs? Open <b>Lessons</b> (left) and start at lesson 1.</li>
          <li>To build a rung: click on a rung's wire to place the blue cursor, click an instruction in the toolbar (e.g. <code>XIC</code>), and type its address (e.g. <code>I:0/0</code>) — press <kbd>Enter</kbd>. Drag instructions to move them.</li>
          <li>Click a rung number to add a comment or edit the whole rung as text (e.g. <code>XIC I:0/0 OTE O:0/0</code>).</li>
          <li>Press <b>RUN</b>. Push the buttons on the machine panel (right). Green highlights show which instructions are true and where power flows.</li>
          <li><b>Step scan</b> runs exactly one scan so you can watch the scan cycle. The speed menu slows everything down.</li>
          <li><b>Challenges</b> have automatic tests, like a lab check-off.</li>
        </ol>
        <h4>Keyboard</h4>
        <p><kbd>Del</kbd> delete · <kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> undo/redo · <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>X</kbd>/<kbd>V</kbd> copy/cut/paste rungs or instructions · <kbd>Enter</kbd> edit address · <kbd>Tab</kbd> next operand · <kbd>Esc</kbd> deselect</p>
        <h4>Saving</h4>
        <p>Your work is saved automatically in this browser. Use <b>File → Save to file</b> to keep a copy or move it to another computer. Challenges and examples each get their own workspace, so they never overwrite your free-play project.</p>
        <h4>Accuracy</h4>
        <p>The simulator follows the published RSLogix 500 instruction behaviour (scan order, timer/counter bits, math overflow faults and so on) with a fixed 10 ms scan. It is a learning tool: it does not connect to real hardware, open .RSS files, or model wiring and electrical details. Always confirm details against Rockwell's manuals (e.g. publication 1747-RM001, SLC 500 and MicroLogix 1000 Instruction Set) and your instructor.</p>
        <p class="prop-help">PLCsim is an independent educational project and is not affiliated with or endorsed by Rockwell Automation. Allen-Bradley, MicroLogix, SLC 500 and RSLogix are trademarks of Rockwell Automation, Inc.</p>`,
      first ? [{ label: 'Browse on my own' }, { label: 'Start lesson 1', primary: true, fn: () => { this.learn.openFirstLesson(); } }] : null);
    }

    toast(msg) {
      let t = document.querySelector('.toast');
      if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
      t.textContent = msg;
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.remove(), 3200);
    }
    toastLong(html) {
      this.io.message(html.replace(/<[^>]+>/g, ''), 'info', true);
    }

    // ---------------- main loop ----------------
    loop() {
      let last = performance.now();
      let uiT = 0, dtT = 0;
      const frame = (now) => {
        const wall = Math.min(now - last, 250);
        last = now;
        const e = this.engine;
        const sim = wall * this.speed;
        let scans = 0;
        if (e.mode === 'RUN') scans = e.advance(sim);
        this.io.tick(e.mode === 'TEST' ? 0 : sim);
        uiT += wall; dtT += wall;
        if (uiT > 33) {
          uiT = 0;
          if (e.mode === 'RUN' || e.mode === 'TEST') this.editor.liveUpdate();
          this.updateStatus();
          if (e.mode === 'FAULT' && $('faultBar').classList.contains('hidden')) this.updateHeader();
        }
        if (dtT > 120) { dtT = 0; this.panels.tick(); }
        void scans;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    try { PLC.app = new App(); }
    catch (e) {
      console.error(e);
      document.body.insertAdjacentHTML('afterbegin', `<div class="fault-bar">PLCsim failed to start: ${esc(e.message)}</div>`);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
