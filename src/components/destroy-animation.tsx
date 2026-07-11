"use client";

import {
  buildShatterBodies,
  generateFracture,
  spawnEmbers,
  stepShatter,
  type Ember,
  type ShatterBody,
} from "@/lib/shatter";
import html2canvas from "html2canvas";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type WipePhase =
  | "idle"
  | "arming"
  | "charge"
  | "detonate"
  | "fracture"
  | "shatter"
  | "void";

type DestroyContextValue = {
  phase: WipePhase;
  triggerDestroy: (origin: DOMRect) => void;
};

const DestroyContext = createContext<DestroyContextValue | null>(null);

const TIMING = {
  arming: 520,
  charge: 780,
  detonate: 280,
  fracture: 420,
  shatterMin: 2200,
  void: 900,
} as const;

export function useDestroyAnimation() {
  const ctx = useContext(DestroyContext);
  if (!ctx) {
    throw new Error("useDestroyAnimation must be used within DestroyAnimationProvider");
  }
  return ctx;
}

type Props = {
  children: ReactNode;
  onComplete: () => void;
};

function WipeOverlay({
  phase,
  origin,
  crackProgress,
}: {
  phase: WipePhase;
  origin: DOMRect;
  crackProgress: number;
}) {
  const ox = origin.left + origin.width / 2;
  const oy = origin.top + origin.height / 2;
  const showTerminal = phase === "arming" || phase === "charge" || phase === "void";
  const showCharge =
    phase === "charge" || phase === "detonate" || phase === "fracture";

  return (
    <div className="wipe-overlay pointer-events-none fixed inset-0 z-[300] overflow-hidden">
      {(phase === "arming" || phase === "charge") && (
        <div className="wipe-scanlines absolute inset-0" />
      )}

      {phase === "arming" && <div className="wipe-vignette wipe-vignette-arm" />}

      {showTerminal && (
        <div className="wipe-terminal absolute inset-x-0 bottom-16 flex justify-center px-6">
          <div className="wipe-terminal-box font-mono text-xs sm:text-sm">
            {phase === "arming" && (
              <>
                <p className="text-red-500 wipe-line">[!] SECURE WIPE REQUESTED</p>
                <p className="text-zinc-500 wipe-line wipe-line-2">
                  &gt; arming destruct protocol...
                </p>
              </>
            )}
            {phase === "charge" && (
              <>
                <p className="text-amber-500 wipe-line">[!] CRITICAL — DATA PURGE IMMINENT</p>
                <p className="text-green-500 wipe-line wipe-line-2">
                  &gt; overwriting message buffer...
                </p>
              </>
            )}
            {phase === "void" && (
              <>
                <p className="text-red-500 wipe-line">ROOM DESTROYED</p>
                <p className="text-zinc-600 wipe-line wipe-line-2">
                  &gt; all traces erased
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {phase === "charge" && (
        <div
          className="wipe-beacon absolute"
          style={
            {
              "--ox": `${ox}px`,
              "--oy": `${oy}px`,
            } as React.CSSProperties
          }
        >
          <div className="wipe-beacon-trail" />
          <div className="wipe-beacon-dot" />
        </div>
      )}

      {showCharge && phase !== "charge" && (
        <div
          className="wipe-pulse absolute"
          style={{ left: ox, top: oy }}
        >
          <div className="wipe-pulse-ring" />
          <div className="wipe-pulse-ring wipe-pulse-ring-2" />
          <div className="wipe-pulse-core" />
        </div>
      )}

      {(phase === "detonate" || phase === "fracture" || phase === "shatter") && (
        <div className="wipe-flash absolute inset-0" />
      )}

      {phase === "fracture" && (
        <svg className="wipe-cracks absolute inset-0 w-full h-full" aria-hidden>
          {Array.from({ length: 18 }).map((_, i) => {
            const angle = (i / 18) * Math.PI * 2 + 0.2;
            const len = crackProgress * (60 + (i % 5) * 12);
            const x2 = ox + Math.cos(angle) * len * 8;
            const y2 = oy + Math.sin(angle) * len * 8;
            return (
              <line
                key={i}
                x1={ox}
                y1={oy}
                x2={x2}
                y2={y2}
                stroke="rgba(34,197,94,0.7)"
                strokeWidth={1 + (i % 3) * 0.5}
                strokeLinecap="round"
                opacity={0.3 + crackProgress * 0.7}
              />
            );
          })}
        </svg>
      )}

      {phase === "void" && <div className="wipe-blackout absolute inset-0" />}
    </div>
  );
}

function ShatterStage({
  bodies,
  embers,
  width,
  height,
}: {
  bodies: ShatterBody[];
  embers: Ember[];
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodiesRef = useRef(bodies);
  const embersRef = useRef(embers);
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  bodiesRef.current = bodies;
  embersRef.current = embers;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    lastRef.current = performance.now();

    const frame = (now: number) => {
      const dt = Math.min((now - lastRef.current) / 1000, 0.032);
      lastRef.current = now;

      stepShatter(bodiesRef.current, embersRef.current, dt);

      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);

      for (const body of bodiesRef.current) {
        if (!body.active && body.delay > 0) continue;
        ctx.save();
        ctx.globalAlpha = body.opacity;
        ctx.translate(
          body.origX + body.x + body.width / 2,
          body.origY + body.y + body.height / 2,
        );
        ctx.rotate(body.angle);
        ctx.drawImage(body.canvas, -body.width / 2, -body.height / 2);
        ctx.restore();
      }

      for (const ember of embersRef.current) {
        if (ember.life <= 0) continue;
        ctx.beginPath();
        ctx.globalAlpha = Math.min(1, ember.life);
        ctx.fillStyle =
          ember.hue === 0
            ? `rgba(239,68,68,${ember.life})`
            : `rgba(34,197,94,${ember.life})`;
        ctx.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[250] pointer-events-none"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}

export function DestroyAnimationProvider({ children, onComplete }: Props) {
  const [phase, setPhase] = useState<WipePhase>("idle");
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [crackProgress, setCrackProgress] = useState(0);
  const [shatterBodies, setShatterBodies] = useState<ShatterBody[]>([]);
  const [shatterEmbers, setShatterEmbers] = useState<Ember[]>([]);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const sourceRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const completedRef = useRef(false);
  const shatterDoneRef = useRef(false);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    intervalsRef.current.forEach(clearInterval);
    intervalsRef.current = [];
  };

  const schedule = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  const captureAndShatter = useCallback(
    async (blastOrigin: DOMRect) => {
      if (!sourceRef.current) return;

      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewport({ w, h });

      const ox = w / 2;
      const oy = h * 0.44;

      try {
        const snapshot = await html2canvas(sourceRef.current, {
          backgroundColor: "#0a0a0a",
          scale: Math.min(window.devicePixelRatio, 2),
          logging: false,
          useCORS: true,
          windowWidth: w,
          windowHeight: h,
        });

        const fragments = generateFracture(
          snapshot.width,
          snapshot.height,
          ox * (snapshot.width / w),
          oy * (snapshot.height / h),
        );

        const bodies = buildShatterBodies(
          snapshot,
          fragments,
          ox * (snapshot.width / w),
          oy * (snapshot.height / h),
        );

        const scaleX = w / snapshot.width;
        const scaleY = h / snapshot.height;

        for (const body of bodies) {
          body.origX *= scaleX;
          body.origY *= scaleY;
          body.width *= scaleX;
          body.height *= scaleY;
          body.vx *= scaleX;
          body.vy *= scaleY;
        }

        setShatterBodies(bodies);
        setShatterEmbers(spawnEmbers(ox, oy));
        setPhase("shatter");

        schedule(() => {
          if (shatterDoneRef.current) return;
          shatterDoneRef.current = true;
          setPhase("void");
          schedule(finish, TIMING.void);
        }, TIMING.shatterMin);
      } catch {
        setPhase("void");
        schedule(finish, TIMING.void);
      }
    },
    [finish],
  );

  const triggerDestroy = useCallback(
    (rect: DOMRect) => {
      if (phase !== "idle") return;

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (reducedMotion) {
        finish();
        return;
      }

      clearTimers();
      completedRef.current = false;
      shatterDoneRef.current = false;
      setOrigin(rect);
      setCrackProgress(0);
      setShatterBodies([]);
      setShatterEmbers([]);
      setPhase("arming");

      schedule(() => setPhase("charge"), TIMING.arming);
      schedule(() => setPhase("detonate"), TIMING.arming + TIMING.charge);

      schedule(() => {
        setPhase("fracture");
        let step = 0;
        const crackInterval = setInterval(() => {
          step += 1;
          setCrackProgress(step / 10);
          if (step >= 10) clearInterval(crackInterval);
        }, TIMING.fracture / 10);
        intervalsRef.current.push(crackInterval);
      }, TIMING.arming + TIMING.charge + TIMING.detonate);

      schedule(
        () => void captureAndShatter(rect),
        TIMING.arming + TIMING.charge + TIMING.detonate + TIMING.fracture,
      );
    },
    [phase, captureAndShatter, finish],
  );

  useEffect(() => () => clearTimers(), []);

  const hideSource =
    phase === "detonate" ||
    phase === "fracture" ||
    phase === "shatter" ||
    phase === "void";

  const uiPhaseClass =
    phase === "arming"
      ? "wipe-ui-arming"
      : phase === "charge"
        ? "wipe-ui-charge"
        : phase === "detonate"
          ? "wipe-ui-detonate"
          : "";

  return (
    <DestroyContext.Provider value={{ phase, triggerDestroy }}>
      <div
        ref={sourceRef}
        className={`wipe-source h-full w-full ${hideSource ? "wipe-source-hidden" : ""} ${uiPhaseClass}`}
      >
        {children}
      </div>

      {phase !== "idle" && origin && (
        <>
          <WipeOverlay phase={phase} origin={origin} crackProgress={crackProgress} />

          {phase === "shatter" && shatterBodies.length > 0 && (
            <ShatterStage
              bodies={shatterBodies}
              embers={shatterEmbers}
              width={viewport.w}
              height={viewport.h}
            />
          )}
        </>
      )}
    </DestroyContext.Provider>
  );
}

export function DestroyPanel({
  children,
  className = "",
}: {
  panel?: "header" | "body" | "footer";
  children: ReactNode;
  className?: string;
}) {
  const { phase } = useDestroyAnimation();
  const armed = phase === "arming" || phase === "charge";

  return (
    <div className={`${className} ${armed ? "wipe-panel-armed" : ""}`}>
      {children}
    </div>
  );
}
