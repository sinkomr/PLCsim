/*
 * Data table + address parsing, RSLogix 500 style.
 *
 *   I:0/3  I:0.1/2  O:0/0      I/O (e = slot, .s = word within slot, /b = bit)
 *   S:1/15  S:4                status file
 *   B3:0/5  B3/21              bit file (word/bit form, or bit-number form)
 *   T4:0/DN  T4:0.ACC          timer   (EN TT DN, PRE ACC)
 *   C5:0/DN  C5:0.PRE          counter (CU CD DN OV UN UA, PRE ACC)
 *   R6:0/DN  R6:0.POS          control (EN EU DN EM ER UL IN FD, LEN POS)
 *   N7:0  N7:0/3  F8:0         integer, integer bit, float
 *   #N7:0                      file (start of a block of words)
 *
 * All word storage is Int16Array; floats use Float32Array.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  const ELEM_WORDS = { T: 3, C: 3, R: 3 };
  const SUB_BITS = {
    T: { EN: 15, TT: 14, DN: 13 },
    C: { CU: 15, CD: 14, DN: 13, OV: 12, UN: 11, UA: 10 },
    R: { EN: 15, EU: 14, DN: 13, EM: 12, ER: 11, UL: 10, IN: 9, FD: 8 },
  };
  const SUB_WORDS = {
    T: { PRE: 1, ACC: 2 },
    C: { PRE: 1, ACC: 2 },
    R: { LEN: 1, POS: 2 },
  };
  const TYPE_NAMES = {
    O: 'Output', I: 'Input', S: 'Status', B: 'Bit', T: 'Timer',
    C: 'Counter', R: 'Control', N: 'Integer', F: 'Float',
  };

  class AddrError extends Error {}

  const toInt16 = (v) => (v << 16) >> 16;

  class DataTable {
    constructor(profile) {
      this.profile = profile;
      this.files = new Map();
      // I/O word layout: each slot gets ceil(points/16) words (min 1 if used).
      this.inSlots = new Map();
      this.outSlots = new Map();
      let iw = 0, ow = 0;
      for (const s of profile.slots) {
        const ni = Math.ceil(s.inputs / 16), no = Math.ceil(s.outputs / 16);
        if (ni) { this.inSlots.set(s.slot, { start: iw, words: ni, points: s.inputs }); iw += ni; }
        if (no) { this.outSlots.set(s.slot, { start: ow, words: no, points: s.outputs }); ow += no; }
      }
      this._add({ num: 0, type: 'O', len: Math.max(ow, 1) });
      this._add({ num: 1, type: 'I', len: Math.max(iw, 1) });
      this._add({ num: 2, type: 'S', len: profile.statusWords });
      for (const f of profile.files) this._add(f);
    }

    _add(f) {
      const wpe = ELEM_WORDS[f.type] || 1;
      const file = {
        num: f.num, type: f.type, len: f.len, wpe,
        data: f.type === 'F' ? new Float32Array(f.len) : new Int16Array(f.len * wpe),
      };
      this.files.set(f.num, file);
      return file;
    }

    file(num) { return this.files.get(num); }

    fileByLetter(letter, num) {
      if (num === undefined || num === '') {
        const def = { O: 0, I: 1, S: 2 }[letter];
        if (def === undefined) throw new AddrError(`${letter} needs a file number (e.g. ${letter}${letter === 'B' ? 3 : 7}:0)`);
        num = def;
      }
      const f = this.files.get(num);
      if (!f) throw new AddrError(`File ${letter}${num} does not exist on this controller`);
      if (f.type !== letter) throw new AddrError(`File ${num} is a ${TYPE_NAMES[f.type]} file (${f.type}${num}), not ${letter}`);
      return f;
    }

    /*
     * Parse an address. Returns a ref:
     *   {kind:'bit',  file, word, bit, text}
     *   {kind:'word', file, word, text}            (Int16 word)
     *   {kind:'float',file, word, text}
     *   {kind:'elem', file, elem, text}            (T/C/R element)
     *   {kind:'file', file, word, text}            (#file start)
     */
    parse(raw) {
      if (typeof raw !== 'string') throw new AddrError('Missing address');
      let s = raw.trim().toUpperCase();
      let isFile = false;
      if (s.startsWith('#')) { isFile = true; s = s.slice(1); }
      const m = /^([OISBTCRNF])(\d*)(?::(\d+))?(?:\.(\d+|[A-Z]+))?(?:\/(\d+|[A-Z]+))?$/.exec(s);
      if (!m) throw new AddrError(`"${raw}" is not a valid address`);
      const [, letter, fnum, elemS, subS, bitS] = m;
      const f = this.fileByLetter(letter, fnum === '' ? undefined : parseInt(fnum, 10));
      const L = letter;
      const P = (fnum === '' ? L : L + f.num);

      // Bit-number form: B3/21 (no element).
      if (elemS === undefined) {
        if (L === 'B' && bitS !== undefined && subS === undefined && /^\d+$/.test(bitS)) {
          const n = parseInt(bitS, 10);
          const word = n >> 4, bit = n & 15;
          if (word >= f.len) throw new AddrError(`${raw}: bit ${n} is past the end of ${P} (${f.len * 16} bits)`);
          return { kind: 'bit', file: f.num, word, bit, text: `${P}:${word}/${bit}` };
        }
        throw new AddrError(`"${raw}" needs an element number, e.g. ${P}:0`);
      }
      const e = parseInt(elemS, 10);

      if (L === 'I' || L === 'O') {
        const slots = L === 'I' ? this.inSlots : this.outSlots;
        const sl = slots.get(e);
        if (!sl) throw new AddrError(`${raw}: there is no ${L === 'I' ? 'input' : 'output'} in slot ${e}`);
        let w = 0;
        if (subS !== undefined) {
          if (!/^\d+$/.test(subS)) throw new AddrError(`"${raw}" is not a valid I/O address`);
          w = parseInt(subS, 10);
        }
        if (w >= sl.words) throw new AddrError(`${raw}: slot ${e} has only ${sl.words} word${sl.words > 1 ? 's' : ''}`);
        const base = `${L}:${e}` + (w ? `.${w}` : '');
        if (bitS !== undefined) {
          const b = this._bitNum(bitS, raw);
          return this._ret(isFile, { kind: 'bit', file: f.num, word: sl.start + w, bit: b, text: `${base}/${b}` }, raw);
        }
        return this._ret(isFile, { kind: 'word', file: f.num, word: sl.start + w, text: base }, raw);
      }

      if (e >= f.len) throw new AddrError(`${raw}: element ${e} is past the end of ${P} (0–${f.len - 1})`);

      if (ELEM_WORDS[L]) {
        const base = `${P}:${e}`;
        const sub = subS !== undefined ? subS : bitS;
        if (sub === undefined) return this._ret(isFile, { kind: 'elem', file: f.num, elem: e, text: base }, raw);
        if (subS !== undefined && bitS !== undefined) throw new AddrError(`"${raw}" is not a valid address`);
        if (SUB_BITS[L][sub] !== undefined)
          return { kind: 'bit', file: f.num, word: e * 3, bit: SUB_BITS[L][sub], text: `${base}/${sub}` };
        if (SUB_WORDS[L][sub] !== undefined) {
          const ref = { kind: 'word', file: f.num, word: e * 3 + SUB_WORDS[L][sub], text: `${base}.${sub}` };
          if (bitS !== undefined && subS !== undefined) {
            const b = this._bitNum(bitS, raw);
            return { kind: 'bit', file: f.num, word: ref.word, bit: b, text: `${ref.text}/${b}` };
          }
          return ref;
        }
        const all = Object.keys(SUB_BITS[L]).concat(Object.keys(SUB_WORDS[L])).join(', ');
        throw new AddrError(`${raw}: ${L} elements have ${all}`);
      }

      if (subS !== undefined) throw new AddrError(`"${raw}": use / for a bit, e.g. ${P}:${e}/0`);
      if (L === 'F') {
        if (bitS !== undefined) throw new AddrError(`${raw}: float words have no bits`);
        return this._ret(isFile, { kind: 'float', file: f.num, word: e, text: `${P}:${e}` }, raw);
      }
      if (bitS !== undefined) {
        const b = this._bitNum(bitS, raw);
        return { kind: 'bit', file: f.num, word: e, bit: b, text: `${P}:${e}/${b}` };
      }
      return this._ret(isFile, { kind: 'word', file: f.num, word: e, text: `${P}:${e}` }, raw);
    }

    _bitNum(bitS, raw) {
      if (!/^\d+$/.test(bitS)) throw new AddrError(`"${raw}": bit must be 0–15`);
      const b = parseInt(bitS, 10);
      if (b > 15) throw new AddrError(`"${raw}": bit must be 0–15`);
      return b;
    }

    _ret(isFile, ref, raw) {
      if (!isFile) return ref;
      if (ref.kind === 'elem') return { kind: 'file', file: ref.file, word: ref.elem * 3, text: '#' + ref.text };
      if (ref.kind !== 'word' && ref.kind !== 'float') throw new AddrError(`"${raw}": a # file address must point at a word`);
      return { kind: 'file', file: ref.file, word: ref.word, float: ref.kind === 'float', text: '#' + ref.text };
    }

    tryParse(raw) {
      try { return this.parse(raw); } catch (e) { return null; }
    }

    // ---- access ----
    getBit(r) { return (this.files.get(r.file).data[r.word] >> r.bit) & 1; }
    setBit(r, v) {
      const d = this.files.get(r.file).data;
      d[r.word] = v ? d[r.word] | (1 << r.bit) : d[r.word] & ~(1 << r.bit);
    }
    getWord(r) { return this.files.get(r.file).data[r.word]; }
    setWord(r, v) {
      const f = this.files.get(r.file);
      f.data[r.word] = f.type === 'F' ? v : toInt16(v);
    }
    rawFile(num) { return this.files.get(num).data; }

    // Physical I/O access by slot/point, used by the I/O panel and scenes.
    inputWordIndex(slot, point) {
      const s = this.inSlots.get(slot);
      return s ? s.start + (point >> 4) : -1;
    }
    outputWordIndex(slot, point) {
      const s = this.outSlots.get(slot);
      return s ? s.start + (point >> 4) : -1;
    }
    ioText(letter, slot, point) {
      const w = point >> 4;
      return `${letter}:${slot}${w ? '.' + w : ''}/${point & 15}`;
    }

    snapshot() {
      const out = {};
      for (const [n, f] of this.files) out[n] = Array.from(f.data);
      return out;
    }
    restore(snap) {
      if (!snap) return;
      for (const [n, arr] of Object.entries(snap)) {
        const f = this.files.get(+n);
        if (!f || !Array.isArray(arr)) continue;
        const len = Math.min(arr.length, f.data.length);
        for (let i = 0; i < len; i++) f.data[i] = arr[i];
      }
    }
    // Compact snapshot: only non-zero words (for saving projects).
    sparse(skip) {
      const out = {};
      for (const [n, f] of this.files) {
        if (skip && skip.includes(f.type)) continue;
        const nz = [];
        for (let i = 0; i < f.data.length; i++) if (f.data[i]) nz.push(i, f.data[i]);
        if (nz.length) out[n] = nz;
      }
      return out;
    }
    loadSparse(sp) {
      if (!sp) return;
      for (const [n, pairs] of Object.entries(sp)) {
        const f = this.files.get(+n);
        if (!f) continue;
        for (let i = 0; i + 1 < pairs.length; i += 2) if (pairs[i] < f.data.length) f.data[pairs[i]] = pairs[i + 1];
      }
    }
  }

  // Parse a numeric constant: 25, -3, 1.5, 0FFh, &H1F, &B1010, 16#FF, 2#1010
  function parseConst(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.trim().toUpperCase();
    let m;
    if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10);
    if (/^[-+]?(\d+\.\d*|\.\d+)(E[-+]?\d+)?$/.test(s)) return parseFloat(s);
    if ((m = /^([0-9A-F]+)H$/.exec(s))) return toInt16(parseInt(m[1], 16));
    if ((m = /^(?:&H|16#)([0-9A-F]+)$/.exec(s))) return toInt16(parseInt(m[1], 16));
    if ((m = /^(?:&B|2#)([01]+)$/.exec(s))) return toInt16(parseInt(m[1], 2));
    return null;
  }

  PLC.DataTable = DataTable;
  PLC.AddrError = AddrError;
  PLC.parseConst = parseConst;
  PLC.toInt16 = toInt16;
  PLC.SUB_BITS = SUB_BITS;
  PLC.SUB_WORDS = SUB_WORDS;
  PLC.TYPE_NAMES = TYPE_NAMES;
})(typeof window !== 'undefined' ? window : globalThis);
