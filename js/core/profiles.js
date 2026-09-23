/*
 * Controller profiles. Every profile uses RSLogix 500-style file addressing;
 * a profile only changes the I/O layout, which data files exist (and how big
 * they may be), the timer time bases and which instructions are available.
 *
 * Values are taken from the Rockwell instruction-set and user manuals listed
 * in docs/SOURCES.md. Anything not confirmed there is marked "unverified".
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  // Instruction groups (names only; semantics live in instructions.js).
  const BASIC = [
    'XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'OSR',
    'TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES',
    'EQU', 'NEQ', 'LES', 'LEQ', 'GRT', 'GEQ', 'LIM', 'MEQ',
    'ADD', 'SUB', 'MUL', 'DIV', 'NEG', 'CLR',
    'MOV', 'MVM', 'AND', 'OR', 'XOR', 'NOT',
    'JMP', 'LBL', 'JSR', 'SBR', 'RET', 'MCR', 'TND',
    'BSL', 'BSR', 'SQO', 'SQC', 'COP', 'FLL',
  ];

  // MicroLogix 1100/1200/1400/1500: ONS is the input one-shot; OSR/OSF are
  // output one-shots with a storage bit and an output bit.
  const BASIC_ML = BASIC.concat(['ONS', 'OSF']);

  // Data-file templates. len = number of elements.
  function fixedFiles(b, t, c, r, n) {
    return [
      { num: 3, type: 'B', len: b },
      { num: 4, type: 'T', len: t },
      { num: 5, type: 'C', len: c },
      { num: 6, type: 'R', len: r },
      { num: 7, type: 'N', len: n },
    ];
  }
  // Configurable controllers: files grow on demand up to 256 elements, like
  // RSLogix 500 does when you type an address past the end of a file.
  function configurableFiles(withFloat) {
    const f = [
      { num: 3, type: 'B', len: 256 },
      { num: 4, type: 'T', len: 256 },
      { num: 5, type: 'C', len: 256 },
      { num: 6, type: 'R', len: 256 },
      { num: 7, type: 'N', len: 256 },
    ];
    if (withFloat) f.push({ num: 8, type: 'F', len: 256 });
    return f;
  }

  const ML1000 = [
    ['ML1000-10', '1761-L10Bxx', 6, 4],
    ['ML1000-16', '1761-L16xxx', 10, 6],
    ['ML1000-20', '1761-L20xxx', 12, 8],
    ['ML1000-32', '1761-L32xxx', 20, 12],
  ].map(([id, cat, ni, no]) => ({
    id,
    name: `MicroLogix 1000 — ${ni + no}-point (${ni} in / ${no} out)`,
    short: `ML1000 ${ni + no}pt`,
    family: 'MicroLogix 1000',
    catalog: cat,
    slots: [{ slot: 0, name: 'Embedded I/O', inputs: ni, outputs: no }],
    files: fixedFiles(32, 40, 32, 16, 105),
    fixedFiles: true,
    statusWords: 33,
    timeBases: [1.0, 0.01],
    maxProgFile: 15,
    float: false,
    osr: 'slc',
    instructions: BASIC,
  }));

  const PROFILES = ML1000.concat([
    {
      id: 'ML1100',
      name: 'MicroLogix 1100 (10 in / 6 out)',
      short: 'ML1100',
      family: 'MicroLogix 1100',
      catalog: '1763-L16xxx',
      slots: [{ slot: 0, name: 'Embedded I/O', inputs: 10, outputs: 6 }],
      files: configurableFiles(true),
      fixedFiles: false,
      statusWords: 66,
      timeBases: [1.0, 0.01, 0.001],
      maxProgFile: 255,
      float: true,
      osr: 'ml',
      instructions: BASIC_ML,
    },
    {
      id: 'ML1200',
      name: 'MicroLogix 1200 — 24-point (14 in / 10 out)',
      short: 'ML1200',
      family: 'MicroLogix 1200',
      catalog: '1762-L24xxx',
      slots: [{ slot: 0, name: 'Embedded I/O', inputs: 14, outputs: 10 }],
      files: configurableFiles(true),
      fixedFiles: false,
      statusWords: 66,
      timeBases: [1.0, 0.01, 0.001],
      maxProgFile: 255,
      float: true,
      osr: 'ml',
      instructions: BASIC_ML,
    },
    {
      id: 'ML1400',
      name: 'MicroLogix 1400 (20 in / 12 out)',
      short: 'ML1400',
      family: 'MicroLogix 1400',
      catalog: '1766-L32xxx',
      slots: [{ slot: 0, name: 'Embedded I/O', inputs: 20, outputs: 12 }],
      files: configurableFiles(true),
      fixedFiles: false,
      statusWords: 66,
      timeBases: [1.0, 0.01, 0.001],
      maxProgFile: 255,
      float: true,
      osr: 'ml',
      instructions: BASIC_ML,
    },
    {
      id: 'ML1500',
      name: 'MicroLogix 1500 — 1764-24 base (12 in / 12 out)',
      short: 'ML1500',
      family: 'MicroLogix 1500',
      catalog: '1764-24xxx',
      slots: [{ slot: 0, name: 'Base unit I/O', inputs: 12, outputs: 12 }],
      files: configurableFiles(true),
      fixedFiles: false,
      statusWords: 66,
      timeBases: [1.0, 0.01, 0.001],
      maxProgFile: 255,
      float: true,
      osr: 'ml',
      instructions: BASIC_ML,
    },
  ]);

  // SLC 500 modular controllers: processor in slot 0, a 16-point input card in
  // slot 1 and a 16-point output card in slot 2 by default.
  const SLC_RACK = [
    { slot: 1, name: '1746-IB16 (16 DC inputs)', inputs: 16, outputs: 0 },
    { slot: 2, name: '1746-OB16 (16 DC outputs)', inputs: 0, outputs: 16 },
  ];
  [
    ['SLC-501', 'SLC 5/01', '1747-L511/L514', false],
    ['SLC-502', 'SLC 5/02', '1747-L524', false],
    ['SLC-503', 'SLC 5/03', '1747-L53x', true],
    ['SLC-504', 'SLC 5/04', '1747-L54x', true],
    ['SLC-505', 'SLC 5/05', '1747-L55x', true],
  ].forEach(([id, nm, cat, fl]) => {
    PROFILES.push({
      id,
      name: nm + ' — rack: slot 1 = 16 in, slot 2 = 16 out',
      short: nm,
      family: 'SLC 500',
      catalog: cat,
      slots: SLC_RACK,
      files: configurableFiles(fl),
      fixedFiles: false,
      statusWords: id === 'SLC-501' ? 33 : 83,
      // 5/01 timers have a fixed 0.01 s time base.
      timeBases: id === 'SLC-501' ? [0.01] : [1.0, 0.01],
      maxProgFile: 255,
      float: fl,
      osr: 'slc',
      instructions: BASIC,
    });
  });

  PLC.PROFILES = PROFILES;
  PLC.DEFAULT_PROFILE = 'ML1000-16';
  PLC.getProfile = function (id) {
    return PROFILES.find((p) => p.id === id) || PROFILES[0];
  };
})(typeof window !== 'undefined' ? window : globalThis);
