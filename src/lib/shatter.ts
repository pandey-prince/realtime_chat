export type Point = { x: number; y: number };

export type FragmentPoly = {
  id: number;
  points: Point[];
  cx: number;
  cy: number;
  dist: number;
};

export type ShatterBody = {
  id: number;
  canvas: HTMLCanvasElement;
  origX: number;
  origY: number;
  width: number;
  height: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
  opacity: number;
  delay: number;
  active: boolean;
};

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Cast a ray from origin and find where it exits the viewport. */
export function rayToBorder(
  origin: Point,
  angle: number,
  width: number,
  height: number,
): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const candidates: number[] = [];

  if (Math.abs(cos) > 1e-6) {
    candidates.push((0 - origin.x) / cos);
    candidates.push((width - origin.x) / cos);
  }
  if (Math.abs(sin) > 1e-6) {
    candidates.push((0 - origin.y) / sin);
    candidates.push((height - origin.y) / sin);
  }

  let best = 0;
  for (const t of candidates) {
    if (t <= 0) continue;
    const px = origin.x + cos * t;
    const py = origin.y + sin * t;
    if (px >= -1 && px <= width + 1 && py >= -1 && py <= height + 1) {
      if (t > best) best = t;
    }
  }

  return { x: origin.x + cos * best, y: origin.y + sin * best };
}

function polygonBounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  };
}

function centroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = points.length || 1;
  return { x: x / n, y: y / n };
}

/** Radial glass fracture from detonation origin. */
export function generateFracture(
  width: number,
  height: number,
  originX: number,
  originY: number,
): FragmentPoly[] {
  const origin = { x: originX, y: originY };
  const rayCount = 42;
  const angles: number[] = [];

  for (let i = 0; i < rayCount; i++) {
    angles.push(
      (i / rayCount) * Math.PI * 2 + (hash(i * 13) - 0.5) * 0.22,
    );
  }
  angles.sort((a, b) => a - b);

  const fragments: FragmentPoly[] = [];
  let id = 0;

  for (let i = 0; i < rayCount; i++) {
    const a0 = angles[i];
    const a1 = angles[(i + 1) % rayCount];
    const far0 = rayToBorder(origin, a0, width, height);
    const far1 = rayToBorder(origin, a1, width, height);
    const splits = hash(i * 7) > 0.38 ? 2 : 1;
    let prevInner0 = origin;
    let prevInner1 = origin;

    for (let s = 0; s < splits; s++) {
      const t =
        s === splits - 1
          ? 1
          : 0.18 + hash(i * 19 + s) * 0.42;

      const inner0 = lerp(origin, far0, t);
      const inner1 = lerp(origin, far1, t);

      const poly =
        s === 0
          ? [prevInner0, far0, far1, prevInner1]
          : [prevInner0, inner0, inner1, prevInner1];

      const c = centroid(poly);
      fragments.push({
        id: id++,
        points: poly,
        cx: c.x,
        cy: c.y,
        dist: Math.hypot(c.x - origin.x, c.y - origin.y),
      });

      prevInner0 = inner0;
      prevInner1 = inner1;
    }
  }

  return fragments.sort((a, b) => a.dist - b.dist);
}

export function cropFragment(
  source: HTMLCanvasElement,
  points: Point[],
): { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number } | null {
  const bounds = polygonBounds(points);
  if (bounds.width <= 0 || bounds.height <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const px = points[i].x - bounds.x;
    const py = points[i].y - bounds.y;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(source, -bounds.x, -bounds.y);

  return { canvas, ...bounds };
}

export function buildShatterBodies(
  source: HTMLCanvasElement,
  fragments: FragmentPoly[],
  originX: number,
  originY: number,
): ShatterBody[] {
  const bodies: ShatterBody[] = [];

  for (const frag of fragments) {
    const crop = cropFragment(source, frag.points);
    if (!crop) continue;

    const dx = frag.cx - originX;
    const dy = frag.cy - originY;
    const dist = Math.max(Math.hypot(dx, dy), 1);
    const nx = dx / dist;
    const ny = dy / dist;
    const force = 180 + (dist / Math.max(source.width, source.height)) * 520;
    const spread = (hash(frag.id * 5) - 0.5) * 140;

    bodies.push({
      id: frag.id,
      canvas: crop.canvas,
      origX: crop.x,
      origY: crop.y,
      width: crop.width,
      height: crop.height,
      x: 0,
      y: 0,
      vx: nx * force + (hash(frag.id) - 0.5) * spread,
      vy: ny * force * 0.65 + (hash(frag.id + 1) - 0.5) * spread,
      angle: 0,
      vAngle: (hash(frag.id + 2) - 0.5) * 8,
      opacity: 1,
      delay: (dist / 900) * 180 + hash(frag.id + 3) * 90,
      active: false,
    });
  }

  return bodies;
}

export type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  hue: number;
};

export function spawnEmbers(originX: number, originY: number, count = 48): Ember[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (hash(i * 41) - 0.5) * 0.5;
    const speed = 120 + hash(i * 17) * 280;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.6 + hash(i * 23) * 0.8,
      size: 1 + hash(i * 29) * 2.5,
      hue: hash(i * 31) > 0.7 ? 0 : 145,
    };
  });
}

export function stepShatter(
  bodies: ShatterBody[],
  embers: Ember[],
  dt: number,
): boolean {
  let anyVisible = false;

  for (const body of bodies) {
    if (!body.active) {
      body.delay -= dt * 1000;
      if (body.delay <= 0) body.active = true;
      else {
        anyVisible = true;
        continue;
      }
    }

    body.vy += 620 * dt;
    body.vx *= 1 - 0.8 * dt;
    body.vy *= 1 - 0.35 * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.angle += body.vAngle * dt;
    body.opacity = Math.max(0, body.opacity - dt * 0.55);

    if (body.opacity > 0.01) anyVisible = true;
  }

  for (const ember of embers) {
    ember.vy += 400 * dt;
    ember.x += ember.vx * dt;
    ember.y += ember.vy * dt;
    ember.life -= dt;
    if (ember.life > 0) anyVisible = true;
  }

  return anyVisible;
}
