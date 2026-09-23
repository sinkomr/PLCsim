/*
 * Scan engine.
 *
 * One scan = input scan → program scan → output scan → housekeeping.
 *   - Input scan copies the physical inputs (plus forces) into the I file.
 *   - Program scan solves program file 2 rung by rung, top to bottom, each
 *     rung left to right. Data-table changes are visible immediately to later
 *     rungs in the same scan.
 *   - Output scan copies the O file (plus forces) to the physical outputs.
 *
 * Time is simulated: each scan advances the clock by scanMs (default 10 ms),
 * so timers behave identically at any playback speed, and the grader is
 * deterministic.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  const MODE_BITS = { PROGRAM: 1, RUN: 6, TEST: 8, FAULT: 1 };
  const WATCHDOG_INSTR = 250000; // instructions per scan before a watchdog fault

  class Engine {
    constructor(project) {
      this.scanMs = 10;
      this.listeners = new Set();
      this.load(project);
    }

    load(project) {
      this.project = project;
      this.profile = PLC.getProfile(project.profileId);
      this.dt = new PLC.DataTable(this.profile);
      if (project.data) this.dt.loadSparse(project.data);
      else PLC.forEachInstr(project, (n) => PLC.applyInitialValues(this.dt, this.profile, n));
      const nIn = this.dt.file(1).data.length, nOut = this.dt.file(0).data.length;
      this.inputs = new Int16Array(nIn);   // physical input terminals
      this.outputs = new Int16Array(nOut); // physical output terminals
      this.forces = new Map();             // address text → {ref, value}
      this.mode = 'PROGRAM';
      this.fault = null;
      this.scanCount = 0;
      this.simTime = 0;
      this._acc = 0;
      this.timerFrac = new Map();
      this.compiled = null;
      this._setModeBits();
      this.emit('load');
    }

    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(type, detail) { for (const fn of this.listeners) fn(type, detail); }

    get status() { return this.dt.file(2).data; }

    compile() {
      this.compiled = PLC.compile(this.project, this.dt, this.profile);
      return this.compiled;
    }

    // Write PRE/ACC/LEN/POS values typed into an instruction into the data table.
    applyNode(node) { PLC.applyInitialValues(this.dt, this.profile, node); }

    setMode(mode) {
      if (mode === this.mode) return { ok: true };
      if (this.mode === 'FAULT' && mode !== 'PROGRAM') return { ok: false, errors: [{ msg: 'Clear the fault first' }] };
      if (mode === 'RUN' || mode === 'TEST') {
        const c = this.compile();
        if (!c.ok) return { ok: false, errors: c.errors };
        if (this.mode === 'PROGRAM') {
          this.status[1] |= 1 << 15; // S:1/15 first pass
          this.timerFrac.clear();
          this._acc = 0;
        }
      }
      if (mode === 'PROGRAM') this.outputs.fill(0); // outputs off out of RUN
      this.mode = mode;
      this._setModeBits();
      this.emit('mode', mode);
      return { ok: true };
    }

    _setModeBits() {
      const s = this.status;
      s[1] = (s[1] & ~0x1F) | MODE_BITS[this.mode];
      if (this.forces.size) s[1] |= 1 << 6; else s[1] &= ~(1 << 6);
      s[1] |= 1 << 5; // forces enabled
    }

    raiseFault(code, msg) {
      if (this.fault) return;
      this.fault = { code, msg };
      this.status[1] |= 1 << 13; // S:1/13 major error halted
      this.status[6] = code;     // S:6 major error code
      this.mode = 'FAULT';
      this.outputs.fill(0);
      this._setModeBits();
      this.emit('fault', this.fault);
    }

    clearFault() {
      this.fault = null;
      this.status[1] &= ~(1 << 13);
      this.status[6] = 0;
      this.status[5] &= ~1;
      this.mode = 'PROGRAM';
      this._setModeBits();
      this.emit('mode', 'PROGRAM');
    }

    // ---- forces ----
    setForce(text, value) {
      const ref = this.dt.parse(text);
      if (ref.kind !== 'bit' || ![0, 1].includes(ref.file)) throw new PLC.AddrError('Only I and O bits can be forced');
      if (value === null || value === undefined) this.forces.delete(ref.text);
      else this.forces.set(ref.text, { ref, value: value ? 1 : 0 });
      this._setModeBits();
      this.emit('forces');
    }
    clearForces() { this.forces.clear(); this._setModeBits(); this.emit('forces'); }

    // ---- physical I/O helpers ----
    setInput(slot, point, on) {
      const w = this.dt.inputWordIndex(slot, point);
      if (w < 0) return;
      if (on) this.inputs[w] |= 1 << (point & 15); else this.inputs[w] &= ~(1 << (point & 15));
    }
    getInput(slot, point) {
      const w = this.dt.inputWordIndex(slot, point);
      return w < 0 ? 0 : (this.inputs[w] >> (point & 15)) & 1;
    }
    getOutput(slot, point) {
      const w = this.dt.outputWordIndex(slot, point);
      return w < 0 ? 0 : (this.outputs[w] >> (point & 15)) & 1;
    }

    // ---- scanning ----
    // Advance simulated time by ms, running as many scans as fit.
    advance(ms) {
      if (this.mode !== 'RUN') return 0;
      this._acc += ms;
      let n = 0;
      while (this._acc >= this.scanMs && this.mode === 'RUN') {
        this._acc -= this.scanMs;
        this.scan();
        n++;
      }
      return n;
    }

    // One complete scan. In TEST mode outputs are not written to the terminals.
    scan() {
      if (this.mode !== 'RUN' && this.mode !== 'TEST') return;
      if (!this.compiled || !this.compiled.ok) {
        const c = this.compile();
        if (!c.ok) { this.setMode('PROGRAM'); return; }
      }
      const dt = this.dt;
      const S = this.status;
      const I = dt.file(1).data, O = dt.file(0).data;

      // Input scan
      I.set(this.inputs);
      for (const { ref, value } of this.forces.values())
        if (ref.file === 1) { if (value) I[ref.word] |= 1 << ref.bit; else I[ref.word] &= ~(1 << ref.bit); }

      // Program scan
      const ctx = {
        dt, status: S, dtMs: this.scanMs, timerFrac: this.timerFrac, engine: this,
        jumpTo: null, returnFlag: false, tnd: false, mcrHit: null, depth: 0, count: 0,
        fault: (code, msg) => this.raiseFault(code, msg),
        callSub: (n) => this._runFile(ctx, n),
      };
      this._runFile(ctx, 2);
      if (this.fault) { this.emit('scan'); return; }

      // End of scan: minor error bits still set → major fault 0020h
      if (S[5] & 1) {
        this.raiseFault(0x20, 'Math overflow: the overflow trap bit S:5/0 was still set at the end of the scan. A math result did not fit in 16 bits (-32768 to 32767). Fix the math, or unlatch S:5/0 on the last rung.');
        this.emit('scan');
        return;
      }

      // Output scan (outputs are held off in TEST mode)
      if (this.mode === 'RUN') {
        this.outputs.set(O);
        for (const { ref, value } of this.forces.values())
          if (ref.file === 0) { if (value) this.outputs[ref.word] |= 1 << ref.bit; else this.outputs[ref.word] &= ~(1 << ref.bit); }
      }

      // Housekeeping
      S[1] &= ~(1 << 15); // first pass done
      this.simTime += this.scanMs;
      this.scanCount++;
      S[4] = PLC.toInt16(Math.floor(this.simTime / 10)); // S:4 free-running clock, 10 ms/count
      S[3] = (S[3] & 0xFF00) | Math.min(255, Math.ceil(this.scanMs / 10)); // S:3 low byte: scan time (10 ms units)
      if ((S[3] >> 8) === 0) S[3] |= 10 << 8; // watchdog 100 ms
      this.emit('scan');
    }

    // Single scan from TEST mode (used by "Step scan").
    singleScan() {
      if (this.mode === 'PROGRAM') {
        const r = this.setMode('TEST');
        if (!r.ok) return r;
      }
      if (this.mode !== 'TEST') return { ok: false, errors: [{ msg: 'Step scan works from Program or Test mode' }] };
      this.scan();
      return { ok: true };
    }

    _runFile(ctx, num) {
      const rungs = this.compiled.files.get(num);
      if (!rungs) { this.raiseFault(0x1F, `JSR to missing program file ${num}`); return; }
      if (ctx.depth >= 8) { this.raiseFault(0x42, 'Subroutines nested more than 8 deep (a subroutine probably calls itself)'); return; }
      ctx.depth++;
      const saveMcr = [ctx.mcrOpen, ctx.mcrFalse];
      ctx.mcrOpen = false; ctx.mcrFalse = false;
      const labels = this.compiled.labels.get(num);
      let i = 0;
      while (i < rungs.length && !ctx.tnd && !this.fault) {
        const r = rungs[i];
        ctx.mcrHit = null;
        this._execSeries(ctx, r.items, !ctx.mcrFalse);
        ctx.count += r.count;
        if (ctx.count > WATCHDOG_INSTR) {
          this.raiseFault(0x22, 'Watchdog: the scan never finished. A JMP probably jumps backwards forever.');
          break;
        }
        if (ctx.mcrHit) {
          if (!ctx.mcrOpen) { ctx.mcrOpen = true; ctx.mcrFalse = !ctx.mcrHit.rc; }
          else { ctx.mcrOpen = false; ctx.mcrFalse = false; }
        }
        if (ctx.returnFlag) { ctx.returnFlag = false; if (num !== 2) break; }
        if (ctx.jumpTo !== null) {
          const target = labels.get(ctx.jumpTo);
          ctx.jumpTo = null;
          if (target === undefined) { this.raiseFault(0x1F, 'JMP to a label that does not exist'); break; }
          i = target;
          continue;
        }
        i++;
      }
      [ctx.mcrOpen, ctx.mcrFalse] = saveMcr;
      ctx.depth--;
    }

    _execSeries(ctx, items, rc) {
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        if (it.t === 'I') {
          it.rec.rcIn = rc;
          it.truth = 0;
          rc = it.spec.exec(ctx, it, rc);
          it.rec.rcOut = rc;
          it.rec.truth = it.truth;
        } else {
          const rec = this.compiled.recs.get(it.node);
          rec.rcIn = rc;
          let out = false;
          for (const leg of it.legs) out = this._execSeries(ctx, leg, rc) || out;
          rec.rcOut = out;
          rc = out;
        }
      }
      return rc;
    }
  }

  PLC.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
