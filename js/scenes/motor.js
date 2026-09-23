/*
 * Motor Start/Stop Station scene.
 *   O:0/0 motor starter M1, O:0/1 RUNNING (green), O:0/2 STOPPED (red), O:0/3 OVERLOAD (amber)
 *   I:0/2 overload relay contact (sensor, NC: 1 when healthy, 0 when tripped)
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  PLC.registerScene('motor', function create(host, api) {
    const K = PLC.sceneKit, D = K.draw;
    const W = 480, H = 300;
    const st = K.stage(host, W, H);
    const say = K.messenger(api);
    const JAM_TRIP_MS = 60000;

    const ol = new K.Sensor(api, 'I:0/2', 1);
    let speed = 0, angle = 0, beltPos = 0, tripped = false, runMs = 0, tripWarnMs = 0;

    const btnTrip = st.button('Trip overload', () => trip('Overload tripped manually.'), 'Open the overload relay contact (I:0/2 → 0)');
    st.button('Reset overload', () => {
      tripped = false; runMs = 0; tripWarnMs = 0; ol.force(1);
      say('Overload reset — I:0/2 is closed again.', 'info', 'olreset');
    }, 'Close the overload contact again (I:0/2 → 1)');
    const jam = st.toggle('Jam', false, () => { runMs = 0; },
      'Heavy load: the overload trips if the motor runs for more than 60 s continuously');

    function trip(msg) {
      if (tripped) return;
      tripped = true;
      ol.force(0);
      say(msg + ' I:0/2 is now 0.', 'warn', 'trip');
    }

    function step(h) {
      const on = !!api.out('O:0/0');
      const target = on ? 1 : 0;
      const tau = on ? 0.9 : 2.6; // spin-up faster than coast-down
      speed += (target - speed) * (1 - Math.exp(-h / 1000 / tau));
      if (!on && speed < 0.002) speed = 0;
      angle += speed * Math.PI * 2 * 1.4 * (h / 1000);
      beltPos += speed * 110 * (h / 1000);
      if (on && !tripped) {
        runMs += h;
        if (jam.value && runMs > JAM_TRIP_MS) trip('Motor jammed — overload tripped after 60 s under heavy load.');
      } else if (!on) runMs = 0;
      if (on && tripped) {
        tripWarnMs += h;
        if (tripWarnMs > 1000) say('The overload is tripped but O:0/0 is still on — your program should drop the motor out.', 'bad', 'stillon');
      } else tripWarnMs = 0;
      ol.sense(tripped ? 0 : 1);
    }

    function draw() {
      const C = st.begin(), ctx = st.ctx;
      const on = !!api.out('O:0/0');
      // floor
      ctx.fillStyle = C.ground;
      ctx.fillRect(0, 222, W, 78);
      ctx.strokeStyle = C.soft; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 222.5); ctx.lineTo(W, 222.5); ctx.stroke();

      const mx = 118, my = 124, mr = 62, px = 282, py = 124, pr = 40, sr = 22;
      // belt (behind motor): external tangents between sheave (r=sr at motor) and pulley
      const dx = px - mx, d = Math.abs(dx);
      const a = Math.asin((pr - sr) / d);
      const n = (s) => ({ x: -Math.sin(a) * s, y: -Math.cos(a) * s });
      ctx.save();
      ctx.lineWidth = 7; ctx.strokeStyle = C.metalDark; ctx.lineCap = 'butt';
      const up = n(1), dn = { x: up.x, y: -up.y };
      const belt = () => {
        ctx.beginPath();
        ctx.moveTo(mx + up.x * sr, my + up.y * sr); ctx.lineTo(px + up.x * pr, py + up.y * pr);
        ctx.arc(px, py, pr, Math.atan2(up.y, up.x), Math.atan2(dn.y, dn.x), false);
        ctx.lineTo(mx + dn.x * sr, my + dn.y * sr);
        ctx.arc(mx, my, sr, Math.atan2(dn.y, dn.x), Math.atan2(up.y, up.x), false);
        ctx.closePath();
      };
      belt(); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = C.dark ? C.muted : C.panel;
      ctx.setLineDash([6, 10]); ctx.lineDashOffset = -beltPos;
      belt(); ctx.stroke();
      ctx.restore();

      // driven pulley + stand
      ctx.fillStyle = C.metalDark;
      D.rr(ctx, px - 8, py, 16, 222 - py, 3); ctx.fill();
      D.rr(ctx, px - 34, 212, 68, 10, 3); ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = C.metal; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(px, py); ctx.rotate(angle * sr / pr);
      ctx.strokeStyle = C.line; ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(pr - 7, 0); ctx.stroke(); }
      ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(pr - 13, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fillStyle = C.metalDark; ctx.fill();
      if (jam.value) {
        ctx.save();
        ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(px, py, pr + 7, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        D.text(ctx, 'JAMMED LOAD', px, py - pr - 16, { size: 10, weight: 700, color: C.red, align: 'center' });
      } else D.text(ctx, 'LOAD', px, py - pr - 16, { size: 10, weight: 600, color: C.muted, align: 'center' });

      // motor
      D.motor(ctx, C, mx, my, mr, angle, on);
      D.tag(ctx, C, mx, my - mr - 16, 'O:0/0', 'M1 MOTOR', { align: 'center' });

      // bottom strip: starter, overload relay, speed
      const box = (x, w, title, addr, state, color, active) => {
        D.rr(ctx, x, 236, w, 50, 6);
        ctx.fillStyle = active ? K.alpha(color, 0.16) : C.panel; ctx.fill();
        ctx.strokeStyle = active ? color : C.soft; ctx.lineWidth = active ? 2 : 1; ctx.stroke();
        D.tag(ctx, C, x + 8, 250, addr, title, { bg: false });
        D.text(ctx, state, x + 8, 271, { size: 12, weight: 700, color: active ? color : C.muted });
      };
      box(14, 118, 'STARTER', 'O:0/0', on ? 'ENERGISED' : 'OFF', C.on, on);
      box(140, 124, 'OVERLOAD', 'I:0/2', tripped ? 'TRIPPED · 0' : 'OK · 1', tripped ? C.red : C.on, true);
      // speed
      const rpm = Math.round(speed * 1750);
      D.text(ctx, rpm + ' rpm', 272, 252, { size: 13, weight: 700, color: C.fg });
      D.rr(ctx, 272, 266, 66, 8, 4); ctx.fillStyle = C.soft; ctx.fill();
      if (speed > 0.001) { D.rr(ctx, 272, 266, Math.max(8, 66 * speed), 8, 4); ctx.fillStyle = C.accent; ctx.fill(); }
      if (jam.value && on && !tripped) {
        const left = Math.max(0, Math.ceil((JAM_TRIP_MS - runMs) / 1000));
        D.text(ctx, 'trips in ' + left + ' s', 272, 287, { size: 10, weight: 600, color: C.red });
      }

      // pilot light panel
      D.rr(ctx, 350, 14, 120, 272, 8);
      ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.soft; ctx.lineWidth = 1; ctx.stroke();
      D.text(ctx, 'PILOT LIGHTS', 410, 32, { size: 10, weight: 700, color: C.muted, align: 'center' });
      const lights = [['O:0/1', 'RUNNING', C.on], ['O:0/2', 'STOPPED', C.red], ['O:0/3', 'OVERLOAD', C.amber]];
      lights.forEach(([addr, name, col], i) => {
        const y = 72 + i * 72;
        D.lamp(ctx, C, 372, y, 12, !!api.out(addr), col);
        D.text(ctx, addr, 390, y - 7, { size: 10, weight: 700, color: C.accent });
        D.text(ctx, name, 390, y + 8, { size: 10.5, weight: 600, color: C.fg });
      });
      if (!api.running()) D.text(ctx, 'PLC not in RUN', 12, 16, { size: 10, weight: 600, color: C.muted });
    }

    return {
      update(dtMs) {
        K.substep(dtMs, 10, step);
        ol.flush();
        btnTrip.disabled = tripped;
        draw();
      },
      reset() {
        speed = 0; angle = 0; beltPos = 0; tripped = false; runMs = 0; tripWarnMs = 0;
        ol.force(1);
        draw();
      },
      destroy() { st.destroy(); },
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
