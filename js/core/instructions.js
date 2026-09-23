/*
 * Instruction set: operand specs (for the editor/parser) and execution.
 *
 * exec(ctx, ci, rc) receives the rung-condition-in and returns the
 * rung-condition-out. Input instructions AND their condition with rc; output
 * instructions pass rc through and act on it. Every instruction on a rung is
 * executed every scan (outputs "execute false" when rc is false), which is how
 * an OTE turns its bit off and a TON resets.
 *
 * Operand types:
 *   bit   bit address                 src  word address or constant
 *   dst   word address                tmr/ctr/ctl  T/C/R element
 *   res   T, C or R element           tb   time base constant
 *   pre/acc/len/pos  constant stored in the element's data-table word
 *   file  #address                    mask word address or constant
 *   lbl   label number (Q2:n)          pf   program file number (U:n)
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});
  const toInt16 = (v) => (v << 16) >> 16;

  // ---- status file helpers (S2) ----
  const S0 = 0, S5 = 5, S13 = 13, S14 = 14;
  const C_BIT = 0, V_BIT = 1, Z_BIT = 2, S_BIT = 3;

  function setFlags(ctx, { c = 0, v = 0, z = 0, s = 0 }) {
    const st = ctx.status;
    let w = st[S0] & ~0xF;
    w |= (c ? 1 << C_BIT : 0) | (v ? 1 << V_BIT : 0) | (z ? 1 << Z_BIT : 0) | (s ? 1 << S_BIT : 0);
    st[S0] = w;
    if (v) st[S5] |= 1; // S:5/0 overflow trap (minor error)
  }

  // Integer result → 16-bit destination. Overflow clamps to ±32767/-32768
  // unless S:2/14 (math overflow selection) is set, in which case the low 16
  // bits are kept.
  function storeInt(ctx, ci, destRef, r, carry) {
    let v = false, out = r;
    if (r > 32767 || r < -32768) {
      v = true;
      if (ctx.status[2] & (1 << 14)) out = toInt16(r);
      else out = r > 0 ? 32767 : -32768;
    }
    const f = ctx.dt.files.get(destRef.file);
    if (f.type === 'F') {
      f.data[destRef.word] = r;
      setFlags(ctx, { v: !isFinite(r), z: r === 0, s: r < 0 });
      return;
    }
    f.data[destRef.word] = out;
    setFlags(ctx, { c: carry, v, z: out === 0, s: out < 0 });
  }

  function val(ctx, ref) {
    if (ref.kind === 'const') return ref.value;
    return ctx.dt.files.get(ref.file).data[ref.word];
  }
  function isFloatOp(ctx, ...refs) {
    return refs.some((r) => r.kind === 'float' || (r.kind === 'const' && !Number.isInteger(r.value)));
  }
  const bitGet = (ctx, r) => (ctx.dt.files.get(r.file).data[r.word] >> r.bit) & 1;
  function bitSet(ctx, r, on) {
    const d = ctx.dt.files.get(r.file).data;
    if (on) d[r.word] |= 1 << r.bit; else d[r.word] &= ~(1 << r.bit);
  }

  // Element words (T/C/R): control word, word1 (PRE/LEN), word2 (ACC/POS)
  function elem(ctx, ref) {
    const d = ctx.dt.files.get(ref.file).data;
    const o = ref.elem * 3;
    return {
      d, o,
      get ctl() { return d[o]; },
      bit(b) { return (d[o] >> b) & 1; },
      set(b, on) { if (on) d[o] |= 1 << b; else d[o] &= ~(1 << b); },
      get w1() { return d[o + 1]; }, set w1(v) { d[o + 1] = v; },
      get w2() { return d[o + 2]; }, set w2(v) { d[o + 2] = v; },
    };
  }
  const EN = 15, TT = 14, DN = 13;
  const CU = 15, CD = 14, OV = 12, UN = 11;
  const EU = 14, EM = 12, ER = 11, UL = 10, IN = 9, FD = 8;

  function timeBaseMs(ref) {
    return Math.round(ref.value * 1000);
  }

  // Advance a timer's accumulator by elapsed scan time. The fractional part
  // (time that has not yet made a whole tick) is kept per timer.
  function tick(ctx, ci, t) {
    const base = timeBaseMs(ci.refs[1]);
    const key = ci.refs[0].file * 100000 + ci.refs[0].elem;
    let frac = (ctx.timerFrac.get(key) || 0) + ctx.dtMs;
    const inc = Math.floor(frac / base);
    frac -= inc * base;
    ctx.timerFrac.set(key, frac);
    if (inc) t.w2 = Math.min(t.w2 + inc, 32767);
  }
  function clearFrac(ctx, ci) {
    ctx.timerFrac.delete(ci.refs[0].file * 100000 + ci.refs[0].elem);
  }
  function checkTimer(ctx, t) {
    if (t.w1 < 0 || t.w2 < 0) ctx.fault(0x34, 'Negative value in a timer preset or accumulator');
  }

  const I = {}; // spec table
  function def(mn, spec) { I[mn] = Object.assign({ mn }, spec); }

  // ---------------- Bit ----------------
  def('XIC', {
    kind: 'in', group: 'Bit', name: 'Examine If Closed', ops: [['Address', 'bit']],
    help: 'True when the bit is 1 (ON). Think "is it ON?"',
    exec(ctx, ci, rc) { const b = bitGet(ctx, ci.refs[0]); ci.truth = b; return rc && b === 1; },
  });
  def('XIO', {
    kind: 'in', group: 'Bit', name: 'Examine If Open', ops: [['Address', 'bit']],
    help: 'True when the bit is 0 (OFF). Think "is it OFF?"',
    exec(ctx, ci, rc) { const b = bitGet(ctx, ci.refs[0]); ci.truth = b ^ 1; return rc && b === 0; },
  });
  def('OTE', {
    kind: 'out', group: 'Bit', name: 'Output Energize', ops: [['Address', 'bit']],
    help: 'Sets the bit to 1 when the rung is true and 0 when it is false.',
    exec(ctx, ci, rc) { bitSet(ctx, ci.refs[0], rc); ci.truth = rc ? 1 : 0; return rc; },
  });
  def('OTL', {
    kind: 'out', group: 'Bit', name: 'Output Latch', ops: [['Address', 'bit']],
    help: 'Sets the bit to 1 when the rung is true. It stays 1 (even with the rung false) until an OTU unlatches it.',
    exec(ctx, ci, rc) { if (rc) bitSet(ctx, ci.refs[0], 1); ci.truth = bitGet(ctx, ci.refs[0]); return rc; },
  });
  def('OTU', {
    kind: 'out', group: 'Bit', name: 'Output Unlatch', ops: [['Address', 'bit']],
    help: 'Clears the bit to 0 when the rung is true. Does nothing when the rung is false.',
    exec(ctx, ci, rc) { if (rc) bitSet(ctx, ci.refs[0], 0); ci.truth = bitGet(ctx, ci.refs[0]) ^ 1; return rc; },
  });
  def('OSR', {
    kind: 'in', group: 'Bit', name: 'One-Shot Rising', ops: [['Storage bit', 'bit']],
    help: 'Makes the rung true for exactly one scan when the logic before it goes false → true. The storage bit must not be used anywhere else.',
    exec(ctx, ci, rc) {
      const r = ci.refs[0];
      const prev = bitGet(ctx, r);
      bitSet(ctx, r, rc);
      const out = rc && !prev;
      ci.truth = out ? 1 : 0;
      return out;
    },
  });

  // MicroLogix 1100/1200/1400/1500 one-shots. ONS is the input form (same
  // behaviour as the SLC OSR). OSR/OSF there are output instructions that
  // pulse an output bit for one scan on a rising / falling rung edge.
  def('ONS', {
    kind: 'in', group: 'Bit', name: 'One Shot', ops: [['Storage bit', 'bit']],
    help: 'Makes the rung true for exactly one scan when the logic before it goes false → true.',
    exec: I.OSR.exec,
  });
  function edgeOut(rising) {
    return function (ctx, ci, rc) {
      const [st, outb] = ci.refs;
      const prev = bitGet(ctx, st);
      bitSet(ctx, st, rc);
      const pulse = rising ? rc && !prev : !rc && prev;
      bitSet(ctx, outb, pulse);
      ci.truth = pulse ? 1 : 0;
      return rc;
    };
  }
  def('OSR_ML', {
    display: 'OSR', kind: 'out', group: 'Bit', name: 'One Shot Rising', box: true,
    ops: [['Storage Bit', 'bit'], ['Output Bit', 'bit']],
    help: 'Turns Output Bit on for one scan when the rung goes false → true.',
    exec: edgeOut(true),
  });
  def('OSF', {
    kind: 'out', group: 'Bit', name: 'One Shot Falling', box: true,
    ops: [['Storage Bit', 'bit'], ['Output Bit', 'bit']],
    help: 'Turns Output Bit on for one scan when the rung goes true → false.',
    exec: edgeOut(false),
  });

  // ---------------- Timer / counter ----------------
  const TIMER_OPS = [['Timer', 'tmr'], ['Time Base', 'tb'], ['Preset', 'pre'], ['Accum', 'acc']];
  def('TON', {
    kind: 'out', group: 'Timer/Counter', name: 'Timer On Delay', ops: TIMER_OPS, box: true,
    help: 'While the rung is true, ACC counts up in time-base steps. DN turns on when ACC reaches PRE. Rung false resets ACC and all bits.',
    exec(ctx, ci, rc) {
      const t = elem(ctx, ci.refs[0]);
      checkTimer(ctx, t);
      if (rc) {
        t.set(EN, 1);
        if (t.w2 < t.w1) { tick(ctx, ci, t); }
        const done = t.w2 >= t.w1;
        t.set(DN, done); t.set(TT, !done);
      } else {
        t.set(EN, 0); t.set(TT, 0); t.set(DN, 0); t.w2 = 0; clearFrac(ctx, ci);
      }
      return rc;
    },
  });
  def('TOF', {
    kind: 'out', group: 'Timer/Counter', name: 'Timer Off Delay', ops: TIMER_OPS, box: true,
    help: 'DN turns on as soon as the rung is true. When the rung goes false, ACC counts up; DN turns off when ACC reaches PRE.',
    exec(ctx, ci, rc) {
      const t = elem(ctx, ci.refs[0]);
      checkTimer(ctx, t);
      if (rc) {
        t.set(EN, 1); t.set(TT, 0); t.set(DN, 1); t.w2 = 0; clearFrac(ctx, ci);
      } else {
        t.set(EN, 0);
        if (t.bit(DN)) {
          if (t.w2 < t.w1) tick(ctx, ci, t);
          if (t.w2 >= t.w1) { t.set(DN, 0); t.set(TT, 0); } else t.set(TT, 1);
        } else t.set(TT, 0);
      }
      return rc;
    },
  });
  def('RTO', {
    kind: 'out', group: 'Timer/Counter', name: 'Retentive Timer On', ops: TIMER_OPS, box: true,
    help: 'Like TON, but ACC is kept when the rung goes false. Only a RES instruction clears it.',
    exec(ctx, ci, rc) {
      const t = elem(ctx, ci.refs[0]);
      checkTimer(ctx, t);
      if (rc) {
        t.set(EN, 1);
        if (t.w2 < t.w1) tick(ctx, ci, t);
        const done = t.w2 >= t.w1;
        if (done) t.set(DN, 1);
        t.set(TT, !done);
      } else {
        t.set(EN, 0); t.set(TT, 0);
      }
      return rc;
    },
  });
  const CTR_OPS = [['Counter', 'ctr'], ['Preset', 'pre'], ['Accum', 'acc']];
  def('CTU', {
    kind: 'out', group: 'Timer/Counter', name: 'Count Up', ops: CTR_OPS, box: true,
    help: 'Adds 1 to ACC each time the rung goes false → true. DN is on while ACC ≥ PRE. Past 32767 it wraps to -32768 and sets OV.',
    exec(ctx, ci, rc) {
      const c = elem(ctx, ci.refs[0]);
      if (rc && !c.bit(CU)) {
        if (c.w2 === 32767) { c.w2 = -32768; c.set(OV, 1); } else c.w2 = c.w2 + 1;
      }
      c.set(CU, rc);
      c.set(DN, c.w2 >= c.w1);
      return rc;
    },
  });
  def('CTD', {
    kind: 'out', group: 'Timer/Counter', name: 'Count Down', ops: CTR_OPS, box: true,
    help: 'Subtracts 1 from ACC each time the rung goes false → true. Below -32768 it wraps to 32767 and sets UN.',
    exec(ctx, ci, rc) {
      const c = elem(ctx, ci.refs[0]);
      if (rc && !c.bit(CD)) {
        if (c.w2 === -32768) { c.w2 = 32767; c.set(UN, 1); } else c.w2 = c.w2 - 1;
      }
      c.set(CD, rc);
      c.set(DN, c.w2 >= c.w1);
      return rc;
    },
  });
  def('RES', {
    kind: 'out', group: 'Timer/Counter', name: 'Reset', ops: [['Structure', 'res']],
    help: 'When true, resets a timer, counter or control element: ACC/POS = 0 and its status bits cleared.',
    exec(ctx, ci, rc) {
      if (!rc) return rc;
      const r = ci.refs[0];
      const e = elem(ctx, r);
      const type = ctx.dt.files.get(r.file).type;
      if (type === 'T') {
        e.set(EN, 0); e.set(TT, 0); e.set(DN, 0);
        ctx.timerFrac.delete(r.file * 100000 + r.elem);
      } else if (type === 'C') {
        e.d[e.o] &= ~((1 << CU) | (1 << CD) | (1 << DN) | (1 << OV) | (1 << UN));
      } else {
        e.d[e.o] = 0;
      }
      e.w2 = 0;
      return rc;
    },
  });

  // ---------------- Compare ----------------
  function cmp(mn, name, fn, help) {
    def(mn, {
      kind: 'in', group: 'Compare', name, ops: [['Source A', 'src'], ['Source B', 'src']], box: true, help,
      exec(ctx, ci, rc) {
        const t = fn(val(ctx, ci.refs[0]), val(ctx, ci.refs[1]));
        ci.truth = t ? 1 : 0;
        return rc && t;
      },
    });
  }
  cmp('EQU', 'Equal', (a, b) => a === b, 'True when A = B.');
  cmp('NEQ', 'Not Equal', (a, b) => a !== b, 'True when A ≠ B.');
  cmp('LES', 'Less Than', (a, b) => a < b, 'True when A < B.');
  cmp('LEQ', 'Less Than or Equal', (a, b) => a <= b, 'True when A ≤ B.');
  cmp('GRT', 'Greater Than', (a, b) => a > b, 'True when A > B.');
  cmp('GEQ', 'Greater Than or Equal', (a, b) => a >= b, 'True when A ≥ B.');
  def('LIM', {
    kind: 'in', group: 'Compare', name: 'Limit Test', box: true,
    ops: [['Low Lim', 'src'], ['Test', 'src'], ['High Lim', 'src']],
    help: 'If Low ≤ High: true when Low ≤ Test ≤ High. If Low > High: true when Test is outside the band (Test ≥ Low or Test ≤ High).',
    exec(ctx, ci, rc) {
      const lo = val(ctx, ci.refs[0]), t = val(ctx, ci.refs[1]), hi = val(ctx, ci.refs[2]);
      const r = lo <= hi ? t >= lo && t <= hi : t >= lo || t <= hi;
      ci.truth = r ? 1 : 0;
      return rc && r;
    },
  });
  def('MEQ', {
    kind: 'in', group: 'Compare', name: 'Masked Equal', box: true,
    ops: [['Source', 'src'], ['Mask', 'mask'], ['Compare', 'src']],
    help: 'True when the bits of Source selected by Mask equal the same bits of Compare.',
    exec(ctx, ci, rc) {
      const m = val(ctx, ci.refs[1]);
      const r = (val(ctx, ci.refs[0]) & m) === (val(ctx, ci.refs[2]) & m);
      ci.truth = r ? 1 : 0;
      return rc && r;
    },
  });

  // ---------------- Math ----------------
  function math2(mn, name, fn, help) {
    def(mn, {
      kind: 'out', group: 'Math', name, box: true,
      ops: [['Source A', 'src'], ['Source B', 'src'], ['Dest', 'dst']], help,
      exec(ctx, ci, rc) {
        if (!rc) return rc;
        const a = val(ctx, ci.refs[0]), b = val(ctx, ci.refs[1]);
        fn(ctx, ci, a, b, ci.refs[2]);
        return rc;
      },
    });
  }
  math2('ADD', 'Add', (ctx, ci, a, b, d) => {
    if (isFloatOp(ctx, ci.refs[0], ci.refs[1], d)) return storeInt(ctx, ci, d, a + b, 0);
    const carry = ((a & 0xFFFF) + (b & 0xFFFF)) > 0xFFFF;
    storeInt(ctx, ci, d, a + b, carry);
  }, 'Dest = A + B. Sets the overflow flag (S:0/1) if the answer will not fit in 16 bits.');
  math2('SUB', 'Subtract', (ctx, ci, a, b, d) => {
    if (isFloatOp(ctx, ci.refs[0], ci.refs[1], d)) return storeInt(ctx, ci, d, a - b, 0);
    const borrow = (a & 0xFFFF) < (b & 0xFFFF);
    storeInt(ctx, ci, d, a - b, borrow);
  }, 'Dest = A − B.');
  math2('MUL', 'Multiply', (ctx, ci, a, b, d) => {
    const r = a * b;
    if (!isFloatOp(ctx, ci.refs[0], ci.refs[1], d)) {
      // 32-bit product also goes to the math register S:14 (high) / S:13 (low)
      ctx.status[S13] = toInt16(r & 0xFFFF);
      ctx.status[S14] = toInt16((r >> 16) & 0xFFFF);
    }
    storeInt(ctx, ci, d, r, 0);
  }, 'Dest = A × B.');
  math2('DIV', 'Divide', (ctx, ci, a, b, d) => {
    if (b === 0) {
      // Divide by zero: overflow flag set, destination = 32767 (or sign-matched limit)
      const f = ctx.dt.files.get(d.file);
      f.data[d.word] = f.type === 'F' ? (a < 0 ? -Infinity : Infinity) : (a < 0 ? -32768 : 32767);
      setFlags(ctx, { v: 1, s: a < 0 });
      return;
    }
    if (isFloatOp(ctx, ci.refs[0], ci.refs[1], d)) return storeInt(ctx, ci, d, a / b, 0);
    const q = a / b;
    // Integer DIV rounds to the nearest whole number (x.5 rounds away from 0).
    const r = Math.sign(q) * Math.floor(Math.abs(q) + 0.5);
    ctx.status[S14] = toInt16(Math.trunc(q)); // unrounded quotient
    ctx.status[S13] = toInt16(a - Math.trunc(q) * b); // remainder
    storeInt(ctx, ci, d, r, 0);
  }, 'Dest = A ÷ B, rounded to the nearest whole number. Dividing by 0 sets the overflow flag.');
  def('NEG', {
    kind: 'out', group: 'Math', name: 'Negate', box: true, ops: [['Source', 'src'], ['Dest', 'dst']],
    help: 'Dest = −Source.',
    exec(ctx, ci, rc) { if (rc) storeInt(ctx, ci, ci.refs[1], -val(ctx, ci.refs[0]), 0); return rc; },
  });
  def('CLR', {
    kind: 'out', group: 'Math', name: 'Clear', box: true, ops: [['Dest', 'dst']],
    help: 'Dest = 0.',
    exec(ctx, ci, rc) { if (rc) storeInt(ctx, ci, ci.refs[0], 0, 0); return rc; },
  });

  // ---------------- Move / logical ----------------
  def('MOV', {
    kind: 'out', group: 'Move/Logical', name: 'Move', box: true, ops: [['Source', 'src'], ['Dest', 'dst']],
    help: 'Copies Source into Dest each scan the rung is true.',
    exec(ctx, ci, rc) {
      if (!rc) return rc;
      const d = ci.refs[1];
      let v = val(ctx, ci.refs[0]);
      const f = ctx.dt.files.get(d.file);
      if (f.type !== 'F' && !Number.isInteger(v)) {
        // Float → integer rounds; out of range clamps and sets overflow.
        storeInt(ctx, ci, d, Math.round(v), 0);
        return rc;
      }
      f.data[d.word] = v;
      setFlags(ctx, { z: v === 0, s: v < 0 });
      return rc;
    },
  });
  def('MVM', {
    kind: 'out', group: 'Move/Logical', name: 'Masked Move', box: true,
    ops: [['Source', 'src'], ['Mask', 'mask'], ['Dest', 'dst']],
    help: 'Copies only the bits of Source where Mask has a 1; other Dest bits are left alone.',
    exec(ctx, ci, rc) {
      if (!rc) return rc;
      const m = val(ctx, ci.refs[1]);
      const f = ctx.dt.files.get(ci.refs[2].file);
      const r = toInt16((f.data[ci.refs[2].word] & ~m) | (val(ctx, ci.refs[0]) & m));
      f.data[ci.refs[2].word] = r;
      setFlags(ctx, { z: r === 0, s: r < 0 });
      return rc;
    },
  });
  function logic2(mn, name, fn, help) {
    def(mn, {
      kind: 'out', group: 'Move/Logical', name, box: true,
      ops: [['Source A', 'src'], ['Source B', 'src'], ['Dest', 'dst']], help,
      exec(ctx, ci, rc) {
        if (!rc) return rc;
        const r = toInt16(fn(val(ctx, ci.refs[0]), val(ctx, ci.refs[1])));
        ctx.dt.files.get(ci.refs[2].file).data[ci.refs[2].word] = r;
        setFlags(ctx, { z: r === 0, s: r < 0 });
        return rc;
      },
    });
  }
  logic2('AND', 'Bitwise AND', (a, b) => a & b, 'Each Dest bit = A bit AND B bit.');
  logic2('OR', 'Bitwise Inclusive OR', (a, b) => a | b, 'Each Dest bit = A bit OR B bit.');
  logic2('XOR', 'Bitwise Exclusive OR', (a, b) => a ^ b, 'Each Dest bit = 1 when the A and B bits differ.');
  def('NOT', {
    kind: 'out', group: 'Move/Logical', name: 'Not', box: true, ops: [['Source', 'src'], ['Dest', 'dst']],
    help: 'Dest = Source with every bit inverted.',
    exec(ctx, ci, rc) {
      if (!rc) return rc;
      const r = toInt16(~val(ctx, ci.refs[0]));
      ctx.dt.files.get(ci.refs[1].file).data[ci.refs[1].word] = r;
      setFlags(ctx, { z: r === 0, s: r < 0 });
      return rc;
    },
  });

  // ---------------- File / shift / sequencer ----------------
  function fileWord(ctx, fref, i) {
    return { f: ctx.dt.files.get(fref.file), w: fref.word + i };
  }
  function checkFileLen(ctx, fref, words) {
    const f = ctx.dt.files.get(fref.file);
    if (fref.word + words > f.data.length) {
      ctx.fault(0x44, `File ${fref.text} is too short for the requested length`);
      return false;
    }
    return true;
  }
  function shift(dir) {
    return function (ctx, ci, rc) {
      const [fref, cref, sref] = ci.refs;
      const c = elem(ctx, cref);
      const len = c.w1;
      if (rc && !c.bit(EN)) {
        if (len > 0 && checkFileLen(ctx, fref, Math.ceil(len / 16))) {
          const d = ctx.dt.files.get(fref.file).data;
          const gb = (i) => (d[fref.word + (i >> 4)] >> (i & 15)) & 1;
          const sb = (i, v) => {
            const w = fref.word + (i >> 4);
            if (v) d[w] |= 1 << (i & 15); else d[w] &= ~(1 << (i & 15));
          };
          const src = bitGet(ctx, sref);
          if (dir > 0) {
            c.set(UL, gb(len - 1));
            for (let i = len - 1; i > 0; i--) sb(i, gb(i - 1));
            sb(0, src);
          } else {
            c.set(UL, gb(0));
            for (let i = 0; i < len - 1; i++) sb(i, gb(i + 1));
            sb(len - 1, src);
          }
          c.set(DN, 1);
        }
      }
      if (!rc) c.set(DN, 0);
      c.set(EN, rc);
      return rc;
    };
  }
  const SHIFT_OPS = [['File', 'file'], ['Control', 'ctl'], ['Bit Address', 'bit'], ['Length', 'len']];
  def('BSL', {
    kind: 'out', group: 'File/Shift/Seq', name: 'Bit Shift Left', box: true, ops: SHIFT_OPS,
    help: 'On each false → true rung transition, shifts the bit array one place toward higher bit numbers. Bit Address is loaded into bit 0; the bit shifted out goes to UL.',
    exec: shift(1),
  });
  def('BSR', {
    kind: 'out', group: 'File/Shift/Seq', name: 'Bit Shift Right', box: true, ops: SHIFT_OPS,
    help: 'On each false → true transition, shifts the bit array one place toward bit 0. Bit Address is loaded into the last bit; bit 0 goes to UL.',
    exec: shift(-1),
  });
  const SEQ_OPS = [['File', 'file'], ['Mask', 'mask'], ['Dest', 'dst'], ['Control', 'ctl'], ['Length', 'len'], ['Position', 'pos']];
  function seqStep(ctx, ci, c, rc) {
    // Advance on false → true. Position wraps from LEN back to 1.
    let stepped = false;
    if (rc && !c.bit(EN)) {
      c.w2 = c.w2 >= c.w1 ? 1 : c.w2 + 1;
      stepped = true;
    }
    c.set(EN, rc);
    c.set(DN, c.w2 >= c.w1);
    return stepped;
  }
  def('SQO', {
    kind: 'out', group: 'File/Shift/Seq', name: 'Sequencer Output', box: true, ops: SEQ_OPS,
    help: 'On each false → true transition, steps to the next word of File and copies it (through Mask) to Dest. After the last step (Length) it wraps to step 1.',
    exec(ctx, ci, rc) {
      const [fref, mref, dref, cref] = ci.refs;
      const c = elem(ctx, cref);
      if (c.w2 < 0 || c.w2 > c.w1) { ctx.fault(0x42, `${cref.text}: position is outside 0–length`); return rc; }
      if (seqStep(ctx, ci, c, rc) && checkFileLen(ctx, fref, c.w1 + 1)) {
        const { f, w } = fileWord(ctx, fref, c.w2);
        const m = val(ctx, mref);
        const df = ctx.dt.files.get(dref.file);
        df.data[dref.word] = toInt16((df.data[dref.word] & ~m) | (f.data[w] & m));
      }
      return rc;
    },
  });
  def('SQC', {
    kind: 'out', group: 'File/Shift/Seq', name: 'Sequencer Compare', box: true,
    ops: [['File', 'file'], ['Mask', 'mask'], ['Source', 'src'], ['Control', 'ctl'], ['Length', 'len'], ['Position', 'pos']],
    help: 'On each false → true transition, steps to the next word of File and compares it (through Mask) with Source. FD is set when they match.',
    exec(ctx, ci, rc) {
      const [fref, mref, sref, cref] = ci.refs;
      const c = elem(ctx, cref);
      if (seqStep(ctx, ci, c, rc) && checkFileLen(ctx, fref, c.w1 + 1)) {
        const { f, w } = fileWord(ctx, fref, c.w2);
        const m = val(ctx, mref);
        c.set(FD, (val(ctx, sref) & m) === (f.data[w] & m));
      }
      return rc;
    },
  });
  def('COP', {
    kind: 'out', group: 'File/Shift/Seq', name: 'Copy File', box: true,
    ops: [['Source', 'file'], ['Dest', 'file'], ['Length', 'len']],
    help: 'Copies Length words from the Source file to the Dest file each scan the rung is true.',
    exec(ctx, ci, rc) {
      if (!rc) return rc;
      const [s, d, n] = ci.refs;
      if (!checkFileLen(ctx, s, n.value) || !checkFileLen(ctx, d, n.value)) return rc;
      const sd = ctx.dt.files.get(s.file).data, dd = ctx.dt.files.get(d.file).data;
      const tmp = Array.from(sd.subarray(s.word, s.word + n.value));
      for (let i = 0; i < n.value; i++) dd[d.word + i] = tmp[i];
      return rc;
    },
  });
  def('FLL', {
    kind: 'out', group: 'File/Shift/Seq', name: 'Fill File', box: true,
    ops: [['Source', 'src'], ['Dest', 'file'], ['Length', 'len']],
    help: 'Writes the Source value into Length words of the Dest file each scan the rung is true.',
    exec(ctx, ci, rc) {
      if (!rc) return rc;
      const [s, d, n] = ci.refs;
      if (!checkFileLen(ctx, d, n.value)) return rc;
      const v = val(ctx, s);
      const dd = ctx.dt.files.get(d.file).data;
      for (let i = 0; i < n.value; i++) dd[d.word + i] = v;
      return rc;
    },
  });

  // ---------------- Program control (engine handles flow) ----------------
  def('JMP', {
    kind: 'out', group: 'Program Control', name: 'Jump to Label', ops: [['Label', 'lbl']],
    help: 'When true, skips ahead (or back) to the rung that starts with the matching LBL. Skipped rungs are not scanned — their outputs freeze.',
    exec(ctx, ci, rc) { if (rc) ctx.jumpTo = ci.refs[0].value; return rc; },
  });
  def('LBL', {
    kind: 'in', group: 'Program Control', name: 'Label', ops: [['Label', 'lbl']],
    help: 'Target for a JMP. Must be the first instruction on its rung. Always true.',
    exec(ctx, ci, rc) { ci.truth = 1; return rc; },
  });
  def('JSR', {
    kind: 'out', group: 'Program Control', name: 'Jump to Subroutine', ops: [['SBR File Number', 'pf']],
    help: 'When true, runs every rung of the given program file (U:3, U:4 …), then comes back.',
    exec(ctx, ci, rc) { if (rc) ctx.callSub(ci.refs[0].value); return rc; },
  });
  def('SBR', {
    kind: 'in', group: 'Program Control', name: 'Subroutine', ops: [],
    help: 'Optional marker at the start of a subroutine file. Always true.',
    exec(ctx, ci, rc) { ci.truth = 1; return rc; },
  });
  def('RET', {
    kind: 'out', group: 'Program Control', name: 'Return from Subroutine', ops: [],
    help: 'When true, ends the subroutine early and goes back to the JSR.',
    exec(ctx, ci, rc) { if (rc) ctx.returnFlag = true; return rc; },
  });
  def('MCR', {
    kind: 'out', group: 'Program Control', name: 'Master Control Reset', ops: [],
    help: 'Used in pairs. A conditional MCR starts a zone; an unconditional MCR ends it. When the start rung is false, every rung in the zone is scanned as false (OTEs turn off).',
    exec(ctx, ci, rc) { ctx.mcrHit = { rc }; return rc; },
  });
  def('TND', {
    kind: 'out', group: 'Program Control', name: 'Temporary End', ops: [],
    help: 'When true, ends this program scan right here. Rungs below it are not scanned.',
    exec(ctx, ci, rc) { if (rc) ctx.tnd = true; return rc; },
  });

  // Look up an instruction for a profile (OSR means different things on
  // SLC/ML1000 and on the newer MicroLogix controllers).
  PLC.spec = function (mn, profile) {
    mn = String(mn).toUpperCase();
    if (mn === 'OSR' && profile && profile.osr === 'ml') return I.OSR_ML;
    if (mn === 'OSR_ML') return null;
    return I[mn] || null;
  };
  PLC.allowed = function (mn, profile) {
    return !profile || profile.instructions.includes(String(mn).toUpperCase());
  };
  PLC.INSTR = I;
  PLC.INSTR_GROUPS = ['Bit', 'Timer/Counter', 'Compare', 'Math', 'Move/Logical', 'File/Shift/Seq', 'Program Control'];
  PLC.instrSetFlags = setFlags;
})(typeof window !== 'undefined' ? window : globalThis);
