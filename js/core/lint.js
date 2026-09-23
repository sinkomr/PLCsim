/*
 * Verify: compile errors plus the warnings a PLC instructor would point out.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  function lint(project, dt, profile, compiled) {
    const out = [];
    const c = compiled || PLC.compile(project, dt, profile);
    for (const e of c.errors) out.push(Object.assign({ sev: 'error' }, e));

    const uses = new Map(); // addr → [{mn, file, rung, node, path}]
    const push = (a, u) => { if (!uses.has(a)) uses.set(a, []); uses.get(a).push(u); };
    PLC.forEachInstr(project, (n, f, ri, p) => {
      const sp = PLC.spec(n.mn, profile);
      if (!sp) return;
      sp.ops.forEach((o, k) => {
        const r = dt.tryParse(n.ops[k]);
        if (r) push(r.text, { mn: sp.mn, op: o[1], k, file: f.num, rung: ri, node: n, path: p });
      });
    });
    for (const f of project.files)
      f.rungs.forEach((r, ri) => { if (!r.items.length) out.push({ sev: 'warn', file: f.num, rung: ri, msg: 'Empty rung — it does nothing' }); });

    const where = (u) => `LAD ${u.file} rung ${u.rung}`;
    for (const [a, list] of uses) {
      const ote = list.filter((u) => u.mn === 'OTE');
      if (ote.length > 1)
        out.push({ sev: 'warn', file: ote[1].file, rung: ote[1].rung, node: ote[1].node, msg: `${a} is used by ${ote.length} OTE instructions (${ote.map(where).join(', ')}). Only the LAST one in the scan decides the bit — this is the classic "double coil" mistake. Use a branch on one rung instead.` });
      const lat = list.filter((u) => u.mn === 'OTL'), unl = list.filter((u) => u.mn === 'OTU');
      if (ote.length && (lat.length || unl.length))
        out.push({ sev: 'warn', file: ote[0].file, rung: ote[0].rung, node: ote[0].node, msg: `${a} is driven by both OTE and OTL/OTU. The OTE will overwrite the latch every scan.` });
      if (lat.length && !unl.length && !a.startsWith('S:'))
        out.push({ sev: 'warn', file: lat[0].file, rung: lat[0].rung, node: lat[0].node, msg: `${a} is latched (OTL) but never unlatched (OTU) — once on, it stays on forever.` });
      const osr = list.filter((u) => ['OSR', 'ONS', 'OSR_ML', 'OSF'].includes(u.mn) && u.k === 0);
      if (osr.length && list.some((u) => u.node !== osr[0].node || u.k !== 0))
        out.push({ sev: 'warn', file: osr[0].file, rung: osr[0].rung, node: osr[0].node, msg: `One-shot storage bit ${a} is used somewhere else too. Give every one-shot its own unique bit.` });
      const tmr = list.filter((u) => ['TON', 'TOF', 'RTO'].includes(u.mn));
      if (tmr.length > 1)
        out.push({ sev: 'warn', file: tmr[1].file, rung: tmr[1].rung, node: tmr[1].node, msg: `Timer ${a} is used by ${tmr.length} timer instructions. Each timer instruction needs its own T4 element.` });
      const ctu = list.filter((u) => u.mn === 'CTU'), ctd = list.filter((u) => u.mn === 'CTD');
      if (ctu.length > 1 || ctd.length > 1)
        out.push({ sev: 'warn', file: list[0].file, rung: list[0].rung, node: list[0].node, msg: `Counter ${a} is used by more than one CTU (or CTD). A CTU and a CTD may share a counter; two CTUs should not.` });
      const r = dt.tryParse(a);
      if (r && r.kind === 'bit' && (r.file === 0 || r.file === 1)) {
        const letter = r.file === 1 ? 'I' : 'O';
        const slots = r.file === 1 ? dt.inSlots : dt.outSlots;
        let phys = false;
        for (const [, sl] of slots) if (r.word >= sl.start && r.word < sl.start + sl.words) phys = (r.word - sl.start) * 16 + r.bit < sl.points;
        if (!phys) out.push({ sev: 'warn', file: list[0].file, rung: list[0].rung, node: list[0].node, msg: `${a} is not wired to a real ${letter === 'I' ? 'input' : 'output'} terminal on the ${profile.short}.` });
        if (letter === 'I' && list.some((u) => ['OTE', 'OTL', 'OTU'].includes(u.mn)))
          out.push({ sev: 'warn', file: list[0].file, rung: list[0].rung, node: list[0].node, msg: `${a} is an input, but an output instruction writes to it. The next input scan will overwrite it.` });
      }
    }
    return { ok: c.ok, compiled: c, issues: out };
  }

  PLC.lint = lint;
})(typeof window !== 'undefined' ? window : globalThis);
