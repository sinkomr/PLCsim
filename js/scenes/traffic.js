/*
 * Traffic Light Intersection scene (top-down four-way crossing).
 *   N–S head: O:0/0 RED, O:0/1 YELLOW, O:0/2 GREEN
 *   E–W head: O:0/3 RED, O:0/4 YELLOW, O:0/5 GREEN
 * I:0/0 System ON and I:0/1 Pedestrian are operator devices drawn by the host.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  PLC.registerScene('traffic', function create(host, api) {
    const K = PLC.sceneKit, D = K.draw;
    const W = 480, H = 360;
    const st = K.stage(host, W, H);
    const say = K.messenger(api, 5000);

    const CX = 240, CY = 180, HW = 36;          // intersection centre, road half width
    const L = 24, CW = 13;                     // car length / width
    const VMAX = 72, ACC = 60, BRAKE = 120;     // px/s, px/s², px/s²
    const CARS = ['#3b82f6', '#8b5cf6', '#0ea5e9', '#64748b', '#ec4899', '#14b8a6', '#e2e8f0', '#6366f1', '#a16207'];

    // Each approach: spawn point, unit direction, axis, length of travel.
    // "along" coordinate s = distance of the car centre from its spawn point.
    const DIRS = {
      S: { x0: CX - HW / 2, y0: -20, ux: 0, uy: 1, axis: 'ns', box: [CY - HW + 20, CY + HW + 20], end: H + 40 },
      N: { x0: CX + HW / 2, y0: H + 20, ux: 0, uy: -1, axis: 'ns', box: [H + 20 - (CY + HW), H + 20 - (CY - HW)], end: H + 40 },
      E: { x0: -20, y0: CY + HW / 2, ux: 1, uy: 0, axis: 'ew', box: [CX - HW + 20, CX + HW + 20], end: W + 40 },
      W: { x0: W + 20, y0: CY - HW / 2, ux: -1, uy: 0, axis: 'ew', box: [W + 20 - (CX + HW), W + 20 - (CX - HW)], end: W + 40 },
    };
    for (const k in DIRS) DIRS[k].stop = DIRS[k].box[0] - 16; // stop line (behind the crosswalk)

    let lanes, spawnT, crash, stats, sig, timers, colorIdx;
    const auto = st.toggle('Auto traffic', true, null, 'Cars arrive by themselves from all four directions');
    st.button('Send car', () => spawn(['N', 'S', 'E', 'W'][Math.floor(Math.random() * 4)]), 'Send one car from a random direction');

    function init() {
      lanes = { N: [], S: [], E: [], W: [] };
      spawnT = { N: 1500, S: 3000, E: 2200, W: 4000 };
      crash = null;
      stats = { through: 0, crashes: 0 };
      timers = { darkNS: 0, darkEW: 0, multiNS: 0, multiEW: 0, conflict: 0 };
      colorIdx = 0;
      sig = readSig();
    }

    function readSig() {
      const o = (a) => !!api.out(a);
      const ns = { R: o('O:0/0'), Y: o('O:0/1'), G: o('O:0/2') };
      const ew = { R: o('O:0/3'), Y: o('O:0/4'), G: o('O:0/5') };
      return { ns, ew, conflict: (ns.G && ew.G) || (ns.G && ew.Y) || (ns.Y && ew.G) };
    }

    function spawn(dir) {
      const lane = lanes[dir];
      const last = lane[lane.length - 1];
      if (lane.length >= 9 || (last && last.s < L + 10)) return false;
      lane.push({ s: 0, v: VMAX * 0.8, committed: false, crashed: false, color: CARS[colorIdx++ % CARS.length] });
      return true;
    }

    const inBox = (d, c) => c.s + L / 2 > d.box[0] && c.s - L / 2 < d.box[1];
    function boxCars(axis) {
      let n = 0;
      for (const k in DIRS) if (DIRS[k].axis === axis) for (const c of lanes[k]) if (inBox(DIRS[k], c)) n++;
      return n;
    }

    function step(h) {
      const s = h / 1000;
      sig = readSig();
      const run = api.running();
      // signal fault monitoring
      const lit = (x) => (x.R ? 1 : 0) + (x.Y ? 1 : 0) + (x.G ? 1 : 0);
      const names = (x) => ['R', 'Y', 'G'].filter((k) => x[k]).map((k) => ({ R: 'RED', Y: 'YELLOW', G: 'GREEN' })[k]).join(' + ');
      for (const [ax, label] of [['ns', 'N–S'], ['ew', 'E–W']]) {
        const n = lit(sig[ax]), A = ax.toUpperCase();
        timers['dark' + A] = run && n === 0 ? timers['dark' + A] + h : 0;
        timers['multi' + A] = run && n > 1 ? timers['multi' + A] + h : 0;
        if (timers['dark' + A] > 300) say(`Dark signal: the ${label} head has no lamp lit — drivers don't know what to do.`, 'warn', 'dark' + A);
        if (timers['multi' + A] > 100) say(`The ${label} head shows ${names(sig[ax])} at the same time.`, 'warn', 'multi' + A);
      }
      if (sig.conflict) {
        timers.conflict += h;
        const what = `N–S ${sig.ns.G ? 'GREEN' : 'YELLOW'} and E–W ${sig.ew.G ? 'GREEN' : 'YELLOW'}`;
        if (timers.conflict > 20) say(`Conflicting signals: ${what} are lit together!`, 'bad', 'conflict');
      } else timers.conflict = 0;

      // spawning
      if (auto.value) {
        for (const d in spawnT) {
          spawnT[d] -= h;
          if (spawnT[d] <= 0) {
            spawn(d);
            spawnT[d] = 2500 + Math.random() * 5500;
          }
        }
      }

      // crash handling
      if (crash) {
        crash.t -= h;
        if (crash.t <= 0) {
          for (const d in lanes) lanes[d] = lanes[d].filter((c) => !c.crashed);
          crash = null;
        }
      } else if (sig.conflict && boxCars('ns') > 0 && boxCars('ew') > 0) {
        crash = { t: 3500 };
        stats.crashes++;
        for (const d in lanes) for (const c of lanes[d]) if (inBox(DIRS[d], c)) { c.crashed = true; c.v = 0; }
        say(`CRASH! Both directions had right of way (N–S ${sig.ns.G ? 'GREEN' : sig.ns.Y ? 'YELLOW' : 'RED'}, E–W ${sig.ew.G ? 'GREEN' : sig.ew.Y ? 'YELLOW' : 'RED'}).`, 'bad', 'crash');
      }

      const busy = { ns: boxCars('ns') > 0, ew: boxCars('ew') > 0 };
      for (const dk in lanes) {
        const d = DIRS[dk], lane = lanes[dk], head = sig[d.axis];
        const cross = d.axis === 'ns' ? 'ew' : 'ns';
        for (let i = 0; i < lane.length; i++) {
          const c = lane[i];
          if (c.crashed) continue;
          let limit = Infinity;
          if (i > 0) limit = lane[i - 1].s - L - 7;
          const front = c.s + L / 2;
          const stopS = d.stop - L / 2 - 1;
          if (!c.committed && front <= d.stop + 1) {
            const go = head.G;
            if (!go) {
              // can it still stop at the line? if not, it goes through (e.g. just turned yellow)
              const need = (c.v * c.v) / (2 * BRAKE);
              if (need > stopS - c.s + 2) c.committed = true;
              else limit = Math.min(limit, stopS);
            } else if (!sig.conflict && busy[cross]) {
              limit = Math.min(limit, stopS); // yield to cross traffic still clearing the box
            }
          }
          if (front > d.stop + 1) c.committed = true;
          let vAllowed = VMAX;
          if (limit !== Infinity) vAllowed = Math.sqrt(2 * BRAKE * Math.max(0, limit - c.s));
          c.v = Math.max(0, Math.min(c.v + ACC * s, VMAX, vAllowed));
          c.s += c.v * s;
          if (limit !== Infinity && c.s > limit) { c.s = Math.max(c.s - c.v * s, Math.min(c.s, limit)); }
        }
        while (lane.length && lane[0].s - L / 2 > d.end) { lane.shift(); stats.through++; }
      }
    }

    // ---------- drawing ----------
    function drawCar(ctx, C, d, c) {
      const x = d.x0 + d.ux * c.s, y = d.y0 + d.uy * c.s;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(d.uy, d.ux));
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      D.rr(ctx, -L / 2 + 1.5, -CW / 2 + 1.5, L, CW, 3.5); ctx.fill();
      ctx.fillStyle = c.color;
      D.rr(ctx, -L / 2, -CW / 2, L, CW, 3.5); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = 'rgba(20,30,45,0.75)';
      D.rr(ctx, 2, -CW / 2 + 2, 5, CW - 4, 1.5); ctx.fill();      // windscreen
      D.rr(ctx, -9, -CW / 2 + 2.5, 3.5, CW - 5, 1.2); ctx.fill(); // rear window
      // brake lights when stopping
      if (c.v < 8) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(-L / 2, -CW / 2 + 1, 1.8, 3); ctx.fillRect(-L / 2, CW / 2 - 4, 1.8, 3); }
      ctx.restore();
    }

    function drawHead(ctx, C, x, y, s, addrs, label, align) {
      // vertical 3-lamp head at (x, y) top; labels on the side given by align
      const on = addrs.map((a) => !!api.out(a));
      const n = on.filter(Boolean).length;
      D.rr(ctx, x - 12, y - 12, 24, 72, 6);
      ctx.fillStyle = C.dark ? '#0b0e13' : '#20252d'; ctx.fill();
      ctx.strokeStyle = n > 1 ? C.amber : C.line; ctx.lineWidth = n > 1 ? 2 : 1; ctx.stroke();
      const cols = [C.red, C.amber, C.on], names = ['RED', 'YELLOW', 'GREEN'];
      for (let i = 0; i < 3; i++) {
        const ly = y + i * 24;
        ctx.save();
        ctx.beginPath(); ctx.arc(x, ly, 8.5, 0, Math.PI * 2);
        if (on[i]) { ctx.shadowColor = cols[i]; ctx.shadowBlur = 16; ctx.fillStyle = cols[i]; }
        else ctx.fillStyle = K.mix(cols[i], '#111', 0.78);
        ctx.fill();
        ctx.restore();
        const tx = align === 'right' ? x + 18 : x - 18;
        D.tag(ctx, C, tx, ly, addrs[i], names[i], { align: align === 'right' ? 'left' : 'right', size: 10, color: on[i] ? C.fg : C.muted });
      }
      D.text(ctx, label, x, y - 22, { size: 11, weight: 800, color: C.fg, align: 'center' });
      if (api.running() && n === 0) D.text(ctx, 'DARK', x, y + 70, { size: 10, weight: 800, color: C.amber, align: 'center' });
      if (n > 1) D.text(ctx, '⚠', x + (align === 'right' ? -22 : 22), y - 22, { size: 13, weight: 800, color: C.amber, align: 'center' });
    }

    function draw() {
      const C = st.begin(), ctx = st.ctx;
      const road = C.dark ? K.mix(C.bg, '#ffffff', 0.1) : K.mix(C.panel, '#000000', 0.2);
      const grass = C.dark ? K.mix(C.panel, '#2f6b3a', 0.18) : K.mix(C.panel, '#9bc79a', 0.35);
      ctx.fillStyle = grass; ctx.fillRect(0, 0, W, H);
      // sidewalks
      ctx.fillStyle = K.mix(road, C.panel, 0.55);
      ctx.fillRect(CX - HW - 6, 0, 2 * HW + 12, H);
      ctx.fillRect(0, CY - HW - 6, W, 2 * HW + 12);
      ctx.fillStyle = road;
      ctx.fillRect(CX - HW, 0, 2 * HW, H);
      ctx.fillRect(0, CY - HW, W, 2 * HW);
      const mark = C.dark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)';
      // centre lines
      ctx.strokeStyle = K.alpha(C.amber, 0.85); ctx.lineWidth = 1.5; ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(CX, 0); ctx.lineTo(CX, CY - HW - 16); ctx.moveTo(CX, CY + HW + 16); ctx.lineTo(CX, H);
      ctx.moveTo(0, CY); ctx.lineTo(CX - HW - 16, CY); ctx.moveTo(CX + HW + 16, CY); ctx.lineTo(W, CY);
      ctx.stroke(); ctx.setLineDash([]);
      // crosswalks
      ctx.fillStyle = mark;
      for (let k = -HW + 3; k < HW - 2; k += 8) {
        ctx.fillRect(CX + k, CY - HW - 13, 5, 10); ctx.fillRect(CX + k, CY + HW + 3, 5, 10);
        ctx.fillRect(CX - HW - 13, CY + k, 10, 5); ctx.fillRect(CX + HW + 3, CY + k, 10, 5);
      }
      // stop lines (on the approach half of each road)
      ctx.fillRect(CX - HW, CY - HW - 18, HW, 3);   // southbound
      ctx.fillRect(CX, CY + HW + 15, HW, 3);         // northbound
      ctx.fillRect(CX - HW - 18, CY, 3, HW);         // eastbound
      ctx.fillRect(CX + HW + 15, CY - HW, 3, HW);    // westbound
      // box tint during conflict
      if (sig.conflict) { ctx.fillStyle = K.alpha(C.red, 0.18); ctx.fillRect(CX - HW, CY - HW, 2 * HW, 2 * HW); }

      for (const dk in lanes) for (const c of lanes[dk]) drawCar(ctx, C, DIRS[dk], c);

      if (crash) {
        const t = crash.t / 3500;
        ctx.save(); ctx.translate(CX, CY);
        ctx.fillStyle = K.alpha(C.amber, 0.85);
        ctx.beginPath();
        for (let i = 0; i < 20; i++) {
          const r = i % 2 ? 16 : 34 + 6 * Math.sin(i * 1.7 + t * 10);
          const a = (i / 20) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.red; ctx.scale(0.55, 0.55); ctx.fill();
        ctx.restore();
        D.rr(ctx, CX - 38, CY - 11, 76, 22, 5); ctx.fillStyle = C.red; ctx.fill();
        D.text(ctx, 'CRASH!', CX, CY + 1, { size: 13, weight: 800, color: '#fff', align: 'center' });
      }

      // signal heads (labelled with their outputs)
      drawHead(ctx, C, CX - HW - 30, 42, 1, ['O:0/0', 'O:0/1', 'O:0/2'], 'N–S', 'left');
      drawHead(ctx, C, CX + HW + 30, CY + HW + 42, 1, ['O:0/3', 'O:0/4', 'O:0/5'], 'E–W', 'right');
      // compass
      D.text(ctx, 'N', W - 14, 14, { size: 10, weight: 800, color: C.muted, align: 'center' });
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(W - 14, 36); ctx.lineTo(W - 14, 22); ctx.lineTo(W - 18, 27); ctx.moveTo(W - 14, 22); ctx.lineTo(W - 10, 27); ctx.stroke();

      // stats (bottom-left block)
      const waiting = (ax) => {
        let n = 0;
        for (const dk in lanes) if (DIRS[dk].axis === ax) for (const c of lanes[dk]) if (c.v < 5 && c.s + L / 2 <= DIRS[dk].stop + 2) n++;
        return n;
      };
      const bx = 10, by = CY + HW + 16;
      D.rr(ctx, bx, by, 150, 64, 6);
      ctx.fillStyle = K.alpha(C.panel, 0.9); ctx.fill(); ctx.strokeStyle = C.soft; ctx.lineWidth = 1; ctx.stroke();
      D.text(ctx, `Waiting  N–S ${waiting('ns')}   E–W ${waiting('ew')}`, bx + 8, by + 14, { size: 11, weight: 600, color: C.fg });
      D.text(ctx, `Cars through  ${stats.through}`, bx + 8, by + 32, { size: 11, weight: 600, color: C.fg });
      D.text(ctx, `Crashes  ${stats.crashes}`, bx + 8, by + 50, { size: 11, weight: 600, color: stats.crashes ? C.red : C.fg });
      if (!api.running()) D.text(ctx, 'PLC not in RUN — signals dark', W - 10, H - 12, { size: 10, weight: 600, color: C.fg, align: 'right' });
    }

    init();
    return {
      update(dtMs) {
        K.substep(dtMs, 10, step);
        if (!(dtMs > 0)) sig = readSig();
        draw();
      },
      reset() { init(); draw(); },
      destroy() { st.destroy(); },
      debug: () => ({ stats: Object.assign({}, stats), crash: !!crash, cars: Object.values(lanes).reduce((n, l) => n + l.length, 0) }),
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
