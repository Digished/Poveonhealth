"use client";

import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   SkyScene — a living landscape that follows the real clock.

   • Sky colours, sun/moon, hills and atmosphere are interpolated from the
     current time, so the scene is genuinely different at dawn, noon, dusk
     and midnight.
   • The sun rises in the east, arcs overhead and sets; the moon takes the
     night shift — both positioned on an arc from the actual hour.
   • Three hill layers scroll at different speeds for a parallax "travelling
     through an endless world" feel.

   Performance: everything moves via CSS keyframes on `transform`/`opacity`
   (GPU-composited). The only JS is a 60-second tick to advance the clock —
   no requestAnimationFrame, no per-frame work.
───────────────────────────────────────────────────────────────────────────── */

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function getTimeOfDay(h: number): TimeOfDay {
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

export interface SceneInfo {
  /** true when the sky is dark enough (or it's evening/night) to want light text */
  lightText: boolean;
  tod: TimeOfDay;
}

// ── Colour maths ──────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lerpRGB = (a: RGB, b: RGB, f: number): RGB => [
  lerp(a[0], b[0], f),
  lerp(a[1], b[1], f),
  lerp(a[2], b[2], f),
];
const css = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const rgba = (c: RGB, a: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const lum = (c: RGB) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

interface Stop {
  t: number;
  skyTop: RGB;
  skyBot: RGB;
  hillFar: RGB;
  hillMid: RGB;
  hillNear: RGB;
  glow: RGB;
}

// Keyframes across a 24-hour day (t in fractional hours). 0 and 24 match so the
// cycle is continuous.
const STOPS: Stop[] = [
  { t: 0,    skyTop: [10, 14, 33],   skyBot: [26, 32, 58],   hillFar: [34, 44, 78],  hillMid: [22, 30, 58],  hillNear: [12, 18, 38], glow: [200, 222, 255] },
  { t: 5,    skyTop: [38, 40, 78],   skyBot: [96, 76, 104],  hillFar: [58, 56, 92],  hillMid: [38, 40, 72],  hillNear: [20, 24, 46], glow: [255, 176, 150] },
  { t: 6.5,  skyTop: [104, 150, 206], skyBot: [255, 178, 120], hillFar: [150, 162, 178], hillMid: [96, 124, 128], hillNear: [54, 74, 80], glow: [255, 196, 120] },
  { t: 8,    skyTop: [86, 158, 232], skyBot: [198, 228, 252], hillFar: [168, 200, 198], hillMid: [108, 170, 138], hillNear: [66, 128, 92], glow: [255, 234, 166] },
  { t: 12,   skyTop: [66, 146, 238], skyBot: [190, 224, 255], hillFar: [176, 206, 204], hillMid: [118, 180, 148], hillNear: [78, 138, 96], glow: [255, 250, 214] },
  { t: 16,   skyTop: [92, 158, 228], skyBot: [214, 226, 246], hillFar: [176, 202, 196], hillMid: [120, 176, 140], hillNear: [78, 134, 92], glow: [255, 240, 182] },
  { t: 17.5, skyTop: [96, 92, 158],  skyBot: [255, 156, 96],  hillFar: [158, 128, 150], hillMid: [102, 76, 102], hillNear: [58, 44, 66], glow: [255, 144, 74] },
  { t: 19,   skyTop: [44, 44, 88],   skyBot: [130, 84, 116],  hillFar: [66, 60, 98],  hillMid: [42, 40, 74],  hillNear: [22, 24, 48], glow: [255, 158, 130] },
  { t: 20.5, skyTop: [16, 20, 44],   skyBot: [40, 42, 72],    hillFar: [38, 48, 82],  hillMid: [24, 32, 60],  hillNear: [13, 19, 40], glow: [200, 222, 255] },
  { t: 24,   skyTop: [10, 14, 33],   skyBot: [26, 32, 58],    hillFar: [34, 44, 78],  hillMid: [22, 30, 58],  hillNear: [12, 18, 38], glow: [200, 222, 255] },
];

function sampleScene(t: number): Stop {
  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i].t && t <= STOPS[i + 1].t) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const span = hi.t - lo.t || 1;
  const f = (t - lo.t) / span;
  return {
    t,
    skyTop: lerpRGB(lo.skyTop, hi.skyTop, f),
    skyBot: lerpRGB(lo.skyBot, hi.skyBot, f),
    hillFar: lerpRGB(lo.hillFar, hi.hillFar, f),
    hillMid: lerpRGB(lo.hillMid, hi.hillMid, f),
    hillNear: lerpRGB(lo.hillNear, hi.hillNear, f),
    glow: lerpRGB(lo.glow, hi.glow, f),
  };
}

// ── Clock hook (60s tick) ─────────────────────────────────────────────────────

function useClock() {
  // Deterministic default for SSR/first paint; replaced on mount.
  const [t, setT] = useState(9);
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setT(d.getHours() + d.getMinutes() / 60);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(m.matches);
    apply();
    m.addEventListener?.("change", apply);
    return () => m.removeEventListener?.("change", apply);
  }, []);
  return reduce;
}

/** Text-treatment info derived from the live clock (for content overlaid on a scene). */
export function useSceneInfo(): SceneInfo {
  const t = useClock();
  const s = sampleScene(t);
  const tod = getTimeOfDay(Math.floor(t) % 24);
  const skyLum = lum(lerpRGB(s.skyTop, s.skyBot, 0.45));
  const lightText = skyLum < 0.5 || tod === "evening" || tod === "night";
  return { lightText, tod };
}

// ── Decorative pieces ─────────────────────────────────────────────────────────

const STARS = [
  { cx: 8, cy: 12, r: 0.6, d: 0 }, { cx: 22, cy: 5, r: 0.4, d: 0.5 },
  { cx: 38, cy: 18, r: 0.7, d: 1 }, { cx: 55, cy: 8, r: 0.45, d: 0.2 },
  { cx: 70, cy: 16, r: 0.55, d: 1.5 }, { cx: 85, cy: 6, r: 0.35, d: 0.8 },
  { cx: 15, cy: 28, r: 0.65, d: 2 }, { cx: 45, cy: 30, r: 0.4, d: 0.3 },
  { cx: 62, cy: 24, r: 0.5, d: 1.2 }, { cx: 80, cy: 30, r: 0.6, d: 0.7 },
  { cx: 93, cy: 16, r: 0.45, d: 1.8 }, { cx: 30, cy: 40, r: 0.35, d: 2.5 },
  { cx: 75, cy: 42, r: 0.55, d: 0.4 }, { cx: 5, cy: 44, r: 0.4, d: 1.6 },
  { cx: 50, cy: 14, r: 0.65, d: 0.9 }, { cx: 90, cy: 40, r: 0.3, d: 2.2 },
  { cx: 18, cy: 52, r: 0.5, d: 1.3 }, { cx: 65, cy: 50, r: 0.35, d: 0.6 },
];

function Stars({ opacity }: { opacity: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity }} aria-hidden="true">
      <svg className="w-full h-full" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid slice">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="white"
            style={{ animation: `twinkle 2.6s ease-in-out ${s.d}s infinite alternate` }} />
        ))}
      </svg>
    </div>
  );
}

function Cloud({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="absolute" style={style} aria-hidden="true">
      <svg viewBox="0 0 240 72" fill="none" width="240" height="72">
        <path d="M22 58 Q20 42 38 40 Q36 22 56 20 Q66 9 86 20 Q110 13 124 30 Q142 23 162 36 Q180 29 194 42 Q210 42 216 58 Z" fill="white" />
      </svg>
    </div>
  );
}

function Clouds({ opacity, reduce }: { opacity: number; reduce: boolean }) {
  const anim = (dur: number, delay: number) =>
    reduce ? undefined : `cloud-drift ${dur}s linear ${delay}s infinite`;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity }} aria-hidden="true">
      <Cloud style={{ top: "14%", animation: anim(70, -8), opacity: 0.8 }} />
      <Cloud style={{ top: "38%", animation: anim(105, -45), opacity: 0.5, transform: "scale(1.4)" }} />
      <Cloud style={{ top: "4%", animation: anim(85, -60), opacity: 0.4, transform: "scale(0.8)" }} />
    </div>
  );
}

function Sun({ glow }: { glow: string }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" fill="none" aria-hidden="true">
      {rays.map((a, i) => (
        <line key={a} x1="29" y1="3" x2="29" y2="9" stroke={glow} strokeWidth="2.5" strokeLinecap="round"
          transform={`rotate(${a} 29 29)`} style={{ animation: `ray-pulse 2.4s ease-in-out ${i * 0.25}s infinite` }} />
      ))}
      <circle cx="29" cy="29" r="12" fill={glow} />
      <circle cx="29" cy="29" r="9" fill="#FFF7DB" />
    </svg>
  );
}

function Moon() {
  return (
    <svg width="44" height="44" viewBox="0 0 46 46" fill="none" aria-hidden="true">
      <path d="M32 23C32 30.18 26.18 36 19 36C11.82 36 6 30.18 6 23C6 15.82 11.82 10 19 10C14.2 13.8 13 18.6 15.2 23.4C17.4 28.2 24.5 30.5 32 23Z" fill="#E6EEFF" />
      <circle cx="31" cy="14" r="1.6" fill="#C7D6FF" opacity="0.7" />
      <circle cx="34" cy="20" r="1.1" fill="#C7D6FF" opacity="0.55" />
    </svg>
  );
}

// ── Hills ─────────────────────────────────────────────────────────────────────

/** Build one tile of a rolling hill. y(0) === y(W) so two tiles loop seamlessly. */
function wavePath(baseY: number, amp: number, phase: number): string {
  const W = 1440, H = 200, N = 24;
  let d = `M0 ${(baseY - amp * Math.sin(phase)).toFixed(1)}`;
  for (let i = 1; i <= N; i++) {
    const x = (i / N) * W;
    const y = baseY - amp * Math.sin((i / N) * Math.PI * 2 + phase);
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + ` L${W} ${H} L0 ${H} Z`;
}

const FAR = wavePath(118, 16, 0.4);
const MID = wavePath(92, 24, 1.3);
const NEAR = wavePath(64, 32, 2.7);

function HillLayer({ path, color, heightPct, dur }: { path: string; color: string; heightPct: number; dur: number }) {
  return (
    <div
      className="absolute bottom-0 left-0 flex w-[200%]"
      style={{ height: `${heightPct}%`, animation: dur ? `scene-scroll ${dur}s linear infinite` : undefined, willChange: "transform" }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="block w-1/2 h-full shrink-0">
        <path d={path} fill={color} />
      </svg>
      <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="block w-1/2 h-full shrink-0">
        <path d={path} fill={color} />
      </svg>
    </div>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export function SkyScene({
  heightClass = "h-[240px] sm:h-[280px]",
  fadeColor = "#FAF8F3",
  className = "",
  children,
}: {
  heightClass?: string;
  fadeColor?: string;
  className?: string;
  children?: (info: SceneInfo) => React.ReactNode;
}) {
  const t = useClock();
  const reduce = usePrefersReducedMotion();
  const s = sampleScene(t);
  const tod = getTimeOfDay(Math.floor(t) % 24);

  const skyLum = lum(lerpRGB(s.skyTop, s.skyBot, 0.45));
  const lightText = skyLum < 0.5 || tod === "evening" || tod === "night";

  // Celestial arc — sun up 05:00–19:00, moon overnight.
  const sunUp = t >= 5 && t < 19;
  const raw = sunUp ? (t - 5) / 14 : ((t < 5 ? t + 24 : t) - 19) / 10;
  const p = Math.max(0, Math.min(1, raw));
  const x = 8 + p * 84;                 // east → west
  const alt = Math.sin(p * Math.PI);    // 0 at horizon, 1 at peak
  const top = 82 - alt * 54;            // % from top: low when rising/setting

  const topLum = lum(s.skyTop);
  const starOp = Math.max(0, Math.min(1, (0.46 - topLum) / 0.3));
  const cloudOp = Math.max(0, Math.min(1, (topLum - 0.32) / 0.4));

  return (
    <div
      className={`relative overflow-hidden ${heightClass} ${className}`}
      style={{
        background: `linear-gradient(to bottom, ${css(s.skyTop)} 0%, ${css(s.skyBot)} 100%)`,
        transition: "background 2s linear",
      }}
    >
      {starOp > 0.02 && <Stars opacity={starOp} />}
      {cloudOp > 0.04 && <Clouds opacity={cloudOp} reduce={reduce} />}

      {/* Sun / moon on its arc, with a soft halo. Sits behind the hills so it
          rises out of and sinks into the horizon. */}
      <div
        className="absolute"
        style={{
          left: `${x}%`,
          top: `${top}%`,
          transform: "translate(-50%, -50%)",
          animation: reduce ? undefined : "lab-hero-float 7s ease-in-out infinite",
        }}
        aria-hidden="true"
      >
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: 150, height: 150, background: `radial-gradient(circle, ${rgba(s.glow, 0.5)} 0%, transparent 68%)` }}
        />
        <div className="relative">{sunUp ? <Sun glow={css(s.glow)} /> : <Moon />}</div>
      </div>

      <HillLayer path={FAR} color={css(s.hillFar)} heightPct={52} dur={reduce ? 0 : 90} />
      <HillLayer path={MID} color={css(s.hillMid)} heightPct={42} dur={reduce ? 0 : 58} />
      <HillLayer path={NEAR} color={css(s.hillNear)} heightPct={32} dur={reduce ? 0 : 36} />

      {/* Melt the foreground into the page below */}
      <div
        className="absolute bottom-0 inset-x-0 h-10 pointer-events-none"
        style={{ background: `linear-gradient(to bottom, transparent, ${fadeColor})` }}
        aria-hidden="true"
      />

      {children && <div className="relative z-20 h-full">{children({ lightText, tod })}</div>}
    </div>
  );
}
