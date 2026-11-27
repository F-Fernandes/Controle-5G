import React, { useEffect, useRef } from "react";

/* Fundo dinâmico discreto, fixo atrás do conteúdo.
   variant: "network" (rede de partículas) | "perspective" (grade) | "fiber" (pulsos de luz) */
const ACC = "30,158,168";

function makeNetwork(c, ctx) {
  let P = [];
  const init = () => {
    const n = Math.min(110, Math.round((c.w * c.h) / 14000));
    P = Array.from({ length: n }, () => ({
      x: Math.random() * c.w, y: Math.random() * c.h,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
    }));
  };
  init();
  c.onresize = init;
  return () => {
    ctx.clearRect(0, 0, c.w, c.h);
    for (const p of P) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > c.w) p.vx *= -1;
      if (p.y < 0 || p.y > c.h) p.vy *= -1;
    }
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        const d = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y);
        if (d < 120) {
          ctx.strokeStyle = `rgba(${ACC},${(1 - d / 120) * 0.3})`;
          ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke();
        }
      }
      ctx.fillStyle = `rgba(${ACC},0.65)`;
      ctx.beginPath(); ctx.arc(P[i].x, P[i].y, 1.5, 0, 7); ctx.fill();
    }
  };
}

function makeFiber(c, ctx) {
  let paths = [];
  const init = () => {
    paths = [];
    const n = Math.max(6, Math.round(c.h / 110));
    for (let k = 0; k < n; k++) {
      let x = -10, y = ((k + 0.5) / n) * c.h;
      const pts = [[x, y]];
      while (x < c.w + 10) {
        x += 60 + Math.random() * 120; pts.push([x, y]);
        const dy = (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 35);
        x += Math.abs(dy); y = Math.max(8, Math.min(c.h - 8, y + dy)); pts.push([x, y]);
      }
      const cum = [0];
      for (let i = 1; i < pts.length; i++)
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const len = cum[cum.length - 1];
      paths.push({ pts, cum, len, t: Math.random() * len, sp: 0.9 + Math.random() * 1.3 });
    }
  };
  init();
  c.onresize = init;
  const at = (p, d) => {
    let i = 1;
    while (i < p.cum.length - 1 && p.cum[i] < d) i++;
    const f = (d - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1] || 1);
    return [p.pts[i - 1][0] + f * (p.pts[i][0] - p.pts[i - 1][0]), p.pts[i - 1][1] + f * (p.pts[i][1] - p.pts[i - 1][1])];
  };
  return () => {
    ctx.clearRect(0, 0, c.w, c.h);
    for (const p of paths) {
      ctx.strokeStyle = `rgba(${ACC},0.12)`; ctx.lineWidth = 1; ctx.beginPath();
      p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.stroke();
      p.t += p.sp;
      if (p.t > p.len + 60) p.t = -20;
      for (let k = 0; k < 14; k++) {
        const d = p.t - k * 3;
        if (d < 0 || d > p.len) continue;
        const [x, y] = at(p, d);
        ctx.fillStyle = `rgba(${ACC},${(1 - k / 14) * 0.9})`;
        ctx.beginPath(); ctx.arc(x, y, 2.2 - k * 0.1, 0, 7); ctx.fill();
      }
      if (p.t >= 0 && p.t <= p.len) {
        const [x, y] = at(p, p.t);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
        g.addColorStop(0, `rgba(${ACC},0.45)`); g.addColorStop(1, `rgba(${ACC},0)`);
        ctx.fillStyle = g; ctx.fillRect(x - 16, y - 16, 32, 32);
      }
    }
  };
}

function CanvasFx({ kind }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext("2d");
    const c = { w: 0, h: 0, onresize: null };
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let draw = null, raf = 0, alive = true;
    const size = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      c.w = window.innerWidth; c.h = window.innerHeight;
      cv.width = c.w * d; cv.height = c.h * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      if (!draw) draw = kind === "fiber" ? makeFiber(c, ctx) : makeNetwork(c, ctx);
      else if (c.onresize) c.onresize();
      if (reduce) draw();
    };
    const loop = () => {
      if (!alive) return;
      if (!document.hidden) draw();
      raf = requestAnimationFrame(loop);
    };
    size();
    window.addEventListener("resize", size);
    if (!reduce) loop();
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("resize", size); };
  }, [kind]);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

function Perspective() {
  return (
    <>
      <style>{`
        @keyframes clk-flow { to { background-position: 0 48px; } }
        @media (prefers-reduced-motion: reduce) { .clk-plane { animation: none !important; } }
      `}</style>
      <div style={{ position: "absolute", inset: 0, perspective: "520px", overflow: "hidden" }}>
        <div
          className="clk-plane"
          style={{
            position: "absolute", left: "-50%", right: "-50%", bottom: "-25%", height: "110%",
            transformOrigin: "50% 100%", transform: "rotateX(62deg)",
            backgroundImage: `linear-gradient(rgba(${ACC},.25) 1px,transparent 1px),linear-gradient(90deg,rgba(${ACC},.25) 1px,transparent 1px)`,
            backgroundSize: "48px 48px", animation: "clk-flow 3.4s linear infinite",
            WebkitMaskImage: "linear-gradient(to top,#000 10%,transparent 85%)",
            maskImage: "linear-gradient(to top,#000 10%,transparent 85%)",
          }}
        />
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 45% at 50% 100%,rgba(${ACC},.16),transparent 70%)` }} />
      </div>
    </>
  );
}

export default function Background({ variant }) {
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      {variant === "perspective" ? <Perspective /> : <CanvasFx key={variant} kind={variant} />}
    </div>
  );
}
