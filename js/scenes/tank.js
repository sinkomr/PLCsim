/*
 * Tank Fill & Mix scene.
 *   O:0/0 FILL valve, O:0/1 DRAIN valve, O:0/2 MIXER motor, O:0/3 TANK FULL light (amber)
 *   I:0/2 LOW level switch  (sensor: 1 when level >  params.low)
 *   I:0/3 HIGH level switch (sensor: 1 when level >= params.high)
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  PLC.registerScene('tank', function create(host, api) {
    const K = PLC.sceneKit, D = K.draw;
    const W = 480, H = 330;
    const st = K.stage(host, W, H);
    const say = K.messenger(api, 5000);
    const P = Object.assign({ fillSecondsEmptyToFull: 10, drainSecondsFullToEmpty: 8, low: 0.2, high: 0.8 },
      (api.def && api.def.params) || {});

    // tank geometry (inside of the vessel)
    const TX0 = 172, TX1 = 298, TY0 = 72, TY1 = 268, TH = TY1 - TY0;
    const FLOOR = 316;
    const lowSw = new K.Sensor(api, 'I:0/2', 0);
    const highSw = new K.Sensor(api, 'I:0/3', 0);
    let level, spill, spilling, mixAngle, flowT, puddle, spilledTotal;

    st.button('Empty tank', () => { init(); say('Tank emptied.', 'info', 'empty'); }, 'Instantly empty the tank and clean up any spill');

    function init() {
      level = 0; spill = 0; spilling = 0; mixAngle = 0; flowT = 0; puddle = 0; spilledTotal = 0;
      lowSw.force(0); highSw.force(0);
    }

    function step(h) {
      const s = h / 1000;
      const fill = !!api.out('O:0/0'), drain = !!api.out('O:0/1'), mix = !!api.out('O:0/2');
      let d = 0;
      if (fill) d += s / P.fillSecondsEmptyToFull;
      if (drain && level > 0) d -= s / P.drainSecondsFullToEmpty;
      level += d;
      if (level > 1) {
        const over = level - 1;
        level = 1;
        spilledTotal += over;
        spilling = 600; // keep the spill animation going briefly
        puddle = Math.min(1, puddle + over * 1.5);
        say('Tank overflowed — product spilled! Close the FILL valve when the HIGH switch (I:0/3) makes.', 'bad', 'overflow');
      }
      if (level < 0) level = 0;
      if (spilling > 0) spilling -= h;
      if (mix) mixAngle += s * Math.PI * 2 * 1.5;
      flowT += h;
      lowSw.sense(level > P.low);
      highSw.sense(level >= P.high - 1e-9);
    }

    function draw() {
      const C = st.begin(), ctx = st.ctx;
      const fill = !!api.out('O:0/0'), drain = !!api.out('O:0/1'), mix = !!api.out('O:0/2'), full = !!api.out('O:0/3');
      const water = C.water;
      const pipe = C.metal, pipeEdge = C.line;
      const pipeH = (x0, x1, y) => { ctx.fillStyle = pipe; ctx.fillRect(Math.min(x0, x1), y - 6, Math.abs(x1 - x0), 12); ctx.strokeStyle = pipeEdge; ctx.lineWidth = 1; ctx.strokeRect(Math.min(x0, x1), y - 6, Math.abs(x1 - x0), 12); };
      const pipeV = (x, y0, y1) => { ctx.fillStyle = pipe; ctx.fillRect(x - 6, Math.min(y0, y1), 12, Math.abs(y1 - y0)); ctx.strokeStyle = pipeEdge; ctx.lineWidth = 1; ctx.strokeRect(x - 6, Math.min(y0, y1), 12, Math.abs(y1 - y0)); };
      const flowDash = (pts, on) => {
        if (!on) return;
        ctx.save(); ctx.strokeStyle = water; ctx.lineWidth = 5; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -flowT / 25;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke(); ctx.restore();
      };

      // floor
      ctx.fillStyle = C.ground; ctx.fillRect(0, FLOOR, W, H - FLOOR);
      ctx.strokeStyle = C.soft; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, FLOOR + 0.5); ctx.lineTo(W, FLOOR + 0.5); ctx.stroke();
      // puddle
      if (puddle > 0.001) {
        ctx.fillStyle = K.alpha(water, 0.55);
        const pw = 60 + puddle * 170;
        ctx.beginPath(); ctx.ellipse((TX0 + TX1) / 2, FLOOR + 3, pw, 5 + puddle * 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      // legs
      ctx.fillStyle = C.metalDark;
      ctx.fillRect(TX0 + 8, TY1 + 10, 8, FLOOR - TY1 - 10); ctx.fillRect(TX1 - 16, TY1 + 10, 8, FLOOR - TY1 - 10);

      // fill pipe: supply from the left
      pipeH(0, 222, 40); pipeV(216, 34, TY0 - 2);
      flowDash([[0, 40], [216, 40], [216, TY0 - 2]], fill);
      D.valve(ctx, C, 92, 40, 12, fill);
      D.tag(ctx, C, 92, 14, 'O:0/0', 'FILL', { align: 'center', color: fill ? C.on : C.fg });
      // drain pipe
      pipeV(235, TY1, 296); pipeH(229, W, 296);
      flowDash([[235, TY1], [235, 296], [W, 296]], drain && level > 0.001);
      D.valve(ctx, C, 394, 296, 12, drain);
      D.tag(ctx, C, 394, 268, 'O:0/1', 'DRAIN', { align: 'center', color: drain ? C.on : C.fg });

      // tank shell (back)
      D.rr(ctx, TX0 - 4, TY0 - 8, TX1 - TX0 + 8, TH + 16, 12);
      ctx.fillStyle = C.dark ? K.mix(C.bg, '#000', 0.2) : K.mix(C.bg, C.panel, 0.5); ctx.fill();

      // liquid
      const lh = level * TH, ly = TY1 - lh;
      if (level > 0.0005) {
        ctx.save();
        D.rr(ctx, TX0, TY0, TX1 - TX0, TH, 9); ctx.clip();
        ctx.fillStyle = K.alpha(water, C.dark ? 0.7 : 0.6);
        ctx.beginPath();
        ctx.moveTo(TX0, TY1 + 2);
        const amp = mix ? 3 : fill ? 1.2 : 0;
        for (let x = TX0; x <= TX1; x += 4) ctx.lineTo(x, ly + Math.sin(x / 11 + flowT / (mix ? 140 : 300)) * amp);
        ctx.lineTo(TX1, TY1 + 2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // falling stream into the tank
      if (fill) {
        ctx.fillStyle = K.alpha(water, 0.8);
        ctx.fillRect(213, TY0 - 2, 6, Math.max(0, ly - TY0 + 2));
      }

      // mixer: motor on the lid, shaft + agitator
      const mxX = 256;
      ctx.strokeStyle = C.metalDark; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(mxX, TY0 - 10); ctx.lineTo(mxX, TY1 - 30); ctx.stroke();
      const bw = 26 * Math.cos(mixAngle), bw2 = 26 * Math.cos(mixAngle + Math.PI / 2);
      ctx.fillStyle = mix ? C.accent : C.metalDark;
      for (const [w, y] of [[bw, TY1 - 34], [bw2, TY1 - 34]]) {
        ctx.beginPath(); ctx.ellipse(mxX, y, Math.max(1.5, Math.abs(w)), 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(mxX, TY1 - 34, 4, 0, Math.PI * 2); ctx.fillStyle = C.metalDark; ctx.fill();

      // tank shell (outline + lid)
      ctx.strokeStyle = C.line; ctx.lineWidth = 3;
      D.rr(ctx, TX0 - 4, TY0 - 8, TX1 - TX0 + 8, TH + 16, 12); ctx.stroke();
      // mixer motor on the lid
      D.rr(ctx, mxX - 14, TY0 - 40, 28, 30, 5);
      ctx.fillStyle = C.metal; ctx.fill(); ctx.strokeStyle = mix ? C.on : C.line; ctx.lineWidth = mix ? 2.5 : 1.5; ctx.stroke();
      if (mix) { ctx.save(); ctx.shadowColor = C.on; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore(); }
      D.text(ctx, 'M', mxX, TY0 - 25, { size: 12, weight: 800, color: mix ? C.on : C.muted, align: 'center' });
      D.tag(ctx, C, mxX + 20, TY0 - 30, 'O:0/2', 'MIXER', { color: mix ? C.on : C.fg });

      // overflow: liquid bulges over the rim and runs down both sides
      if (spilling > 0) {
        ctx.save();
        ctx.fillStyle = K.alpha(water, 0.85);
        ctx.beginPath(); ctx.ellipse((TX0 + TX1) / 2, TY0 - 8, (TX1 - TX0) / 2 + 6, 5, 0, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = K.alpha(water, 0.75); ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (const [x, dir] of [[TX0 - 4, -1], [TX1 + 4, 1]]) {
          const wob = Math.sin(flowT / 70 + x) * 1.2;
          ctx.beginPath();
          ctx.moveTo(x - dir * 4, TY0 - 9);
          ctx.quadraticCurveTo(x + dir * 5, TY0 - 10, x + dir * 5 + wob, TY0 + 6);
          ctx.lineTo(x + dir * 5 + wob, FLOOR - 2);
          ctx.stroke();
          // droplets
          ctx.fillStyle = K.alpha(water, 0.8);
          for (let k = 0; k < 4; k++) {
            const t = ((flowT / 600 + k / 4) % 1);
            ctx.beginPath(); ctx.arc(x + dir * (9 + t * 16), FLOOR - 4 - Math.sin(t * Math.PI) * 10, 1.8, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
        D.rr(ctx, (TX0 + TX1) / 2 - 46, TY0 + 12, 92, 22, 5); ctx.fillStyle = C.red; ctx.fill();
        D.text(ctx, 'OVERFLOW!', (TX0 + TX1) / 2, TY0 + 23.5, { size: 12, weight: 800, color: '#fff', align: 'center' });
      }

      // level scale (right side)
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const y = TY1 - (i / 10) * TH;
        ctx.beginPath(); ctx.moveTo(TX1 + 6, y); ctx.lineTo(TX1 + (i % 5 ? 11 : 16), y); ctx.stroke();
        if (i % 5 === 0) D.text(ctx, i * 10 + '%', TX1 + 20, y, { size: 9, color: C.muted });
      }

      // level switches (left side)
      const sw = (frac, sensor, addr, name) => {
        const y = TY1 - frac * TH;
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(TX0, y); ctx.lineTo(TX1, y); ctx.stroke(); ctx.restore();
        const on = sensor.value;
        // float on a stem
        ctx.strokeStyle = C.metalDark; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(TX0 - 4, y); ctx.lineTo(TX0 + 10, on ? y - 5 : y + 5); ctx.stroke();
        ctx.beginPath(); ctx.arc(TX0 + 14, on ? y - 7 : y + 7, 5, 0, Math.PI * 2);
        ctx.fillStyle = on ? C.on : C.metal; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
        D.tag(ctx, C, TX0 - 12, y - 7, addr, name, { align: 'right' });
        D.text(ctx, on ? '1 (liquid above)' : '0', TX0 - 12, y + 8, { size: 10, weight: 700, color: on ? C.on : C.muted, align: 'right' });
      };
      sw(P.high, highSw, 'I:0/3', 'HIGH');
      sw(P.low, lowSw, 'I:0/2', 'LOW');

      // readouts + full light
      D.rr(ctx, 360, 64, 108, 150, 8);
      ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.soft; ctx.lineWidth = 1; ctx.stroke();
      D.text(ctx, 'LEVEL', 414, 80, { size: 10, weight: 700, color: C.muted, align: 'center' });
      D.text(ctx, Math.round(level * 100) + '%', 414, 104, { size: 24, weight: 800, color: level >= 1 ? C.red : C.fg, align: 'center' });
      D.lamp(ctx, C, 384, 150, 11, full, C.amber);
      D.text(ctx, 'O:0/3', 402, 143, { size: 10, weight: 700, color: C.accent });
      D.text(ctx, 'TANK FULL', 402, 157, { size: 10, weight: 600, color: C.fg });
      if (spilledTotal > 0.0005) D.text(ctx, 'SPILLED ' + Math.round(spilledTotal * 100) + '%', 414, 196, { size: 10, weight: 700, color: C.red, align: 'center' });
      else D.text(ctx, fill && drain ? 'filling + draining' : fill ? 'filling' : drain && level > 0 ? 'draining' : '', 414, 196, { size: 10, weight: 600, color: C.muted, align: 'center' });
      if (!api.running()) D.text(ctx, 'PLC not in RUN', W - 8, H - 8, { size: 9, weight: 600, color: C.muted, align: 'right' });
    }

    init();
    return {
      update(dtMs) {
        K.substep(dtMs, 10, step);
        lowSw.flush(); highSw.flush();
        draw();
      },
      reset() { init(); draw(); },
      destroy() { st.destroy(); },
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
