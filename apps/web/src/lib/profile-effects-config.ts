// Profile Effects — particle effect definitions for Plus user profiles

export interface EffectConfig {
  id: string;
  label: string;
  description: string;
  baseParticleCount: number;
}

export const PROFILE_EFFECTS: EffectConfig[] = [
  {
    id: "ink_drops",
    label: "Ink Drops",
    description: "Slow-falling ink droplets dissolving near the bottom",
    baseParticleCount: 20,
  },
  {
    id: "drifting_pages",
    label: "Drifting Pages",
    description: "Torn notebook pages floating across the screen",
    baseParticleCount: 10,
  },
  {
    id: "floating_feathers",
    label: "Quill Feathers",
    description: "Feather quill tips floating gently upward",
    baseParticleCount: 8,
  },
  {
    id: "fireflies",
    label: "Fireflies",
    description: "Warm glowing dots pulsing in darkness",
    baseParticleCount: 25,
  },
  {
    id: "falling_rain",
    label: "Autumn Rain",
    description: "Gentle rainfall with a moody literary atmosphere",
    baseParticleCount: 60,
  },
  {
    id: "snowfall",
    label: "First Snow",
    description: "Soft snowflakes drifting down",
    baseParticleCount: 30,
  },
  {
    id: "rising_embers",
    label: "Rising Embers",
    description: "Warm ember particles floating upward",
    baseParticleCount: 20,
  },
  {
    id: "dust_motes",
    label: "Library Dust",
    description: "Sunlit dust motes floating in still air",
    baseParticleCount: 40,
  },
  {
    id: "confetti",
    label: "Confetti",
    description: "Celebratory paper confetti falling gently",
    baseParticleCount: 25,
  },
  {
    id: "stars",
    label: "Starfield",
    description: "Twinkling stars across the profile",
    baseParticleCount: 50,
  },
];

export const EFFECT_INTENSITIES = [
  { id: "subtle", label: "Subtle", multiplier: 0.5 },
  { id: "moderate", label: "Moderate", multiplier: 1.0 },
  { id: "vibrant", label: "Vibrant", multiplier: 1.5 },
] as const;

export type EffectIntensity = (typeof EFFECT_INTENSITIES)[number]["id"];

export function getEffectById(id: string): EffectConfig | undefined {
  return PROFILE_EFFECTS.find((e) => e.id === id);
}

export function getIntensityMultiplier(intensity: string): number {
  return (
    EFFECT_INTENSITIES.find((i) => i.id === intensity)?.multiplier ?? 1.0
  );
}

// ── Particle system types ──────────────────────────────────────────────────

export interface ThemeColors {
  accent: string;
  accentLight: string;
  muted: string;
  surface: string;
  foreground: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
  rotation: number;
  rotationSpeed: number;
}

// ── Particle behaviors per effect ──────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return [r, g, b];
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

type SpawnFn = (w: number, h: number) => Particle;
type UpdateFn = (p: Particle, dt: number, w: number, h: number) => boolean;
type DrawFn = (
  ctx: CanvasRenderingContext2D,
  p: Particle,
  colors: ThemeColors
) => void;

interface EffectBehavior {
  spawn: SpawnFn;
  update: UpdateFn;
  draw: DrawFn;
}

function makeDefaultParticle(
  x: number,
  y: number,
  vx: number,
  vy: number,
  size: number,
  maxLife: number
): Particle {
  return {
    x,
    y,
    vx,
    vy,
    size,
    opacity: 1,
    life: 0,
    maxLife,
    rotation: rand(0, Math.PI * 2),
    rotationSpeed: rand(-0.5, 0.5),
  };
}

const EFFECT_BEHAVIORS: Record<string, EffectBehavior> = {
  ink_drops: {
    spawn: (w, h) =>
      makeDefaultParticle(
        rand(0, w),
        rand(-20, -5),
        rand(-0.3, 0.3),
        rand(0.4, 1.2),
        rand(3, 6),
        rand(6, 12)
      ),
    update: (p, dt, w, h) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt * 60;
      p.life += dt;
      const progress = p.life / p.maxLife;
      p.opacity = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 0.7;
      p.size += dt * 0.3;
      return p.life < p.maxLife && p.y < h + 20;
    },
    draw: (ctx, p, colors) => {
      const [r, g, b] = hexToRgb(colors.accent);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity * 0.6})`;
      ctx.fill();
    },
  },

  drifting_pages: {
    spawn: (w, h) =>
      makeDefaultParticle(
        rand(-30, w),
        rand(-30, -10),
        rand(0.3, 0.8),
        rand(0.2, 0.6),
        rand(8, 14),
        rand(10, 18)
      ),
    update: (p, dt, w, h) => {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.rotation += p.rotationSpeed * dt;
      p.life += dt;
      const progress = p.life / p.maxLife;
      p.opacity = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 0.4;
      return p.life < p.maxLife && p.x < w + 40 && p.y < h + 40;
    },
    draw: (ctx, p, colors) => {
      const [r, g, b] = hexToRgb(colors.muted);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity * 0.35})`;
      ctx.strokeStyle = `rgba(${r},${g},${b},${p.opacity * 0.5})`;
      ctx.lineWidth = 0.5;
      // Draw a small page shape with a folded corner
      const pw = p.size;
      const ph = p.size * 0.7;
      const fold = p.size * 0.2;
      ctx.beginPath();
      ctx.moveTo(-pw / 2, -ph / 2);
      ctx.lineTo(pw / 2 - fold, -ph / 2);
      ctx.lineTo(pw / 2, -ph / 2 + fold);
      ctx.lineTo(pw / 2, ph / 2);
      ctx.lineTo(-pw / 2, ph / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Fold triangle
      ctx.beginPath();
      ctx.moveTo(pw / 2 - fold, -ph / 2);
      ctx.lineTo(pw / 2 - fold, -ph / 2 + fold);
      ctx.lineTo(pw / 2, -ph / 2 + fold);
      ctx.closePath();
      ctx.strokeStyle = `rgba(${r},${g},${b},${p.opacity * 0.3})`;
      ctx.stroke();
      ctx.restore();
    },
  },

  floating_feathers: {
    spawn: (w, h) =>
      makeDefaultParticle(
        rand(0, w),
        rand(h, h + 30),
        rand(-0.2, 0.2),
        rand(-0.5, -1.0),
        rand(8, 14),
        rand(8, 15)
      ),
    update: (p, dt, w, h) => {
      p.x += (p.vx + Math.sin(p.life * 1.5) * 0.3) * dt * 60;
      p.y += p.vy * dt * 60;
      p.rotation += p.rotationSpeed * dt * 0.5;
      p.life += dt;
      const progress = p.life / p.maxLife;
      p.opacity = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 0.8;
      return p.life < p.maxLife && p.y > -30;
    },
    draw: (ctx, p, colors) => {
      const [r, g, b] = hexToRgb(colors.accent);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      // Feather shape — curved quill body with central spine
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.quadraticCurveTo(p.size * 0.5, -p.size * 0.2, p.size * 0.15, p.size);
      ctx.quadraticCurveTo(0, p.size * 0.8, -p.size * 0.15, p.size);
      ctx.quadraticCurveTo(-p.size * 0.5, -p.size * 0.2, 0, -p.size);
      ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity * 0.55})`;
      ctx.fill();
      // Central spine
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(0, p.size);
      ctx.strokeStyle = `rgba(${r},${g},${b},${p.opacity * 0.4})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    },
  },

  fireflies: {
    spawn: (w, h) =>
      makeDefaultParticle(
        rand(0, w),
        rand(0, h),
        rand(-0.15, 0.15),
        rand(-0.15, 0.15),
        rand(2, 4),
        rand(5, 12)
      ),
    update: (p, dt, w, h) => {
      p.x += (p.vx + Math.sin(p.life * 2) * 0.1) * dt * 60;
      p.y += (p.vy + Math.cos(p.life * 1.5) * 0.1) * dt * 60;
      p.life += dt;
      p.opacity = 0.3 + Math.sin(p.life * 3) * 0.3;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;
      return p.life < p.maxLife;
    },
    draw: (ctx, p, colors) => {
      const [r, g, b] = hexToRgb(colors.accent);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity * 0.7})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity * 0.15})`;
      ctx.fill();
    },
  },

  falling_rain: {
    spawn: (w, h) =>
      makeDefaultParticle(
        rand(-20, w + 20),
        rand(-40, -5),
        rand(-0.4, -0.15),
        rand(4, 7),
        rand(1.2, 2),
        rand(2, 5)
      ),
    update: (p, dt, w, h) => {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.life += dt;
      p.opacity = 0.6;
      return p.y < h + 10;
    },
    draw: (ctx, p, colors) => {
      const [r, g, b] = hexToRgb(colors.foreground);
      // Long rain streak with gradient fade
      const len = p.vy * 3.5;
      const gradient = ctx.createLinearGradient(p.x, p.y - len, p.x, p.y);
      gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      gradient.addColorStop(0.4, `rgba(${r},${g},${b},${p.opacity * 0.25})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},${p.opacity * 0.45})`);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - len);
      ctx.lineTo(p.x + p.vx * 0.5, p.y);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = p.size;
      ctx.lineCap = "round";
      ctx.stroke();
      // Bright raindrop head
      ctx.beginPath();
      ctx.arc(p.x + p.vx * 0.5, p.y, p.size * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity * 0.35})`;
      ctx.fill();
    },
  },

  snowfall: {
    spawn: (w, h) => {
      const size = rand(2, 7);
      return makeDefaultParticle(
        rand(0, w),
        rand(-30, -5),
        rand(-0.2, 0.2),
        rand(0.15, 0.5),
        size,
        rand(12, 25)
      );
    },
    update: (p, dt, w, h) => {
      // Gentle swaying drift
      p.x += (p.vx + Math.sin(p.life * 0.8 + p.rotation) * 0.25) * dt * 60;
      p.y += p.vy * dt * 60;
      p.rotation += p.rotationSpeed * dt * 0.3;
      p.life += dt;
      const progress = p.life / p.maxLife;
      p.opacity = progress > 0.85 ? (1 - (progress - 0.85) / 0.15) : 1;
      return p.life < p.maxLife && p.y < h + 20;
    },
    draw: (ctx, p) => {
      // Snow is always white/near-white with subtle blue tint — independent of theme
      const alpha = p.opacity * 0.7;
      if (p.size > 4) {
        // Larger flakes: draw a 6-pointed snowflake crystal
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.strokeStyle = `rgba(200,210,225,${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.lineCap = "round";
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          const armLen = p.size * 0.85;
          const bx = Math.cos(angle) * armLen;
          const by = Math.sin(angle) * armLen;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(bx, by);
          ctx.stroke();
          // Small branch on each arm
          const mid = 0.55;
          const mx = Math.cos(angle) * armLen * mid;
          const my = Math.sin(angle) * armLen * mid;
          const branchAngle = angle + Math.PI / 5;
          const branchLen = armLen * 0.3;
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(
            mx + Math.cos(branchAngle) * branchLen,
            my + Math.sin(branchAngle) * branchLen
          );
          ctx.stroke();
        }
        // Center dot
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220,225,235,${alpha})`;
        ctx.fill();
        ctx.restore();
      } else {
        // Smaller flakes: soft round dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,218,230,${alpha * 0.85})`;
        ctx.fill();
      }
    },
  },

  rising_embers: {
    spawn: (w, h) =>
      makeDefaultParticle(
        rand(0, w),
        rand(h, h + 30),
        rand(-0.3, 0.3),
        rand(-0.8, -1.5),
        rand(2, 4),
        rand(5, 10)
      ),
    update: (p, dt, w, h) => {
      p.x += (p.vx + Math.sin(p.life * 2) * 0.15) * dt * 60;
      p.y += p.vy * dt * 60;
      p.life += dt;
      const progress = p.life / p.maxLife;
      p.opacity = 1 - progress;
      p.size *= 1 - dt * 0.05;
      return p.life < p.maxLife && p.y > -20;
    },
    draw: (ctx, p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      const warm = `rgba(255,${Math.floor(120 + p.opacity * 80)},${Math.floor(40 * p.opacity)},${p.opacity * 0.7})`;
      ctx.fillStyle = warm;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,160,50,${p.opacity * 0.12})`;
      ctx.fill();
    },
  },

  dust_motes: {
    spawn: (w, h) => {
      const p = makeDefaultParticle(
        rand(0, w),
        rand(0, h),
        rand(-0.04, 0.04),
        rand(-0.04, 0.04),
        rand(1.5, 3.5),
        rand(10, 22)
      );
      // Store a warm golden hue per particle (190-45 = golden to amber range)
      p.rotation = rand(35, 55); // reuse rotation field as hue storage
      p.rotationSpeed = rand(0.3, 1.0); // reuse as brightness multiplier
      return p;
    },
    update: (p, dt, w, h) => {
      // Lazy Brownian drift — barely moving, occasionally caught by an air current
      const brownianX = Math.sin(p.life * 0.4 + p.rotation) * 0.025;
      const brownianY = Math.cos(p.life * 0.6 + p.rotation * 1.3) * 0.02;
      p.x += (p.vx + brownianX) * dt * 60;
      p.y += (p.vy + brownianY - 0.008) * dt * 60; // very slight upward float
      p.life += dt;
      // Slow pulsing — like dust catching and losing sunlight
      p.opacity = 0.4 + Math.sin(p.life * 0.5 + p.rotation) * 0.3;
      if (p.x < -5) p.x = w + 5;
      if (p.x > w + 5) p.x = -5;
      if (p.y < -5) p.y = h + 5;
      if (p.y > h + 5) p.y = -5;
      return p.life < p.maxLife;
    },
    draw: (ctx, p) => {
      // Warm golden tones — dust in sunlight is always warm, regardless of theme
      const warmR = Math.floor(200 + p.rotationSpeed * 55);
      const warmG = Math.floor(160 + p.rotationSpeed * 50);
      const warmB = Math.floor(60 + p.rotationSpeed * 30);
      const alpha = p.opacity * 0.6;
      // Core mote
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${warmR},${warmG},${warmB},${alpha})`;
      ctx.fill();
      // Warm sunlit glow halo
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${warmR},${warmG},${warmB},${alpha * 0.15})`;
      ctx.fill();
    },
  },

  confetti: {
    spawn: (w, h) => {
      const p = makeDefaultParticle(
        rand(0, w),
        rand(-30, -5),
        rand(-0.5, 0.5),
        rand(0.5, 1.0),
        rand(6, 10),
        rand(10, 18)
      );
      p.rotationSpeed = rand(-3, 3);
      return p;
    },
    update: (p, dt, w, h) => {
      // Flutter side-to-side as it falls — like real paper
      p.x += (p.vx + Math.sin(p.life * 2.5) * 0.35) * dt * 60;
      p.y += p.vy * dt * 60;
      p.rotation += p.rotationSpeed * dt;
      p.life += dt;
      const progress = p.life / p.maxLife;
      p.opacity = progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 0.85;
      return p.life < p.maxLife && p.y < h + 30;
    },
    draw: (ctx, p, colors) => {
      // 6 festive colors that work on any background
      const CONFETTI_COLORS = [
        [230, 70, 80],   // red
        [70, 140, 230],  // blue
        [250, 190, 40],  // gold
        [80, 190, 120],  // green
        [200, 80, 200],  // purple
        [250, 130, 60],  // orange
      ];
      // Pick a stable color per particle based on its initial position
      const colorIdx = Math.floor(Math.abs(p.maxLife * 100)) % CONFETTI_COLORS.length;
      const [cr, cg, cb] = CONFETTI_COLORS[colorIdx];
      ctx.save();
      ctx.translate(p.x, p.y);
      // 3D tumble: use sin of rotation to simulate foreshortening
      const scaleX = Math.abs(Math.cos(p.rotation));
      const scaleY = Math.abs(Math.sin(p.rotation * 0.7 + 1));
      ctx.rotate(p.rotation * 0.5);
      ctx.scale(Math.max(scaleX, 0.15), Math.max(scaleY, 0.3));
      // Draw the confetti piece — a rounded rectangle
      const hw = p.size / 2;
      const hh = p.size * 0.35;
      const radius = 1.2;
      ctx.beginPath();
      ctx.moveTo(-hw + radius, -hh);
      ctx.lineTo(hw - radius, -hh);
      ctx.quadraticCurveTo(hw, -hh, hw, -hh + radius);
      ctx.lineTo(hw, hh - radius);
      ctx.quadraticCurveTo(hw, hh, hw - radius, hh);
      ctx.lineTo(-hw + radius, hh);
      ctx.quadraticCurveTo(-hw, hh, -hw, hh - radius);
      ctx.lineTo(-hw, -hh + radius);
      ctx.quadraticCurveTo(-hw, -hh, -hw + radius, -hh);
      ctx.closePath();
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${p.opacity * 0.75})`;
      ctx.fill();
      ctx.restore();
    },
  },

  stars: {
    spawn: (w, h) => {
      const p = makeDefaultParticle(
        rand(0, w),
        rand(0, h),
        0,
        0,
        rand(1.5, 4),
        rand(5, 12)
      );
      // Stagger twinkle phase per star
      p.rotation = rand(0, Math.PI * 2);
      // rotationSpeed encodes star "warmth" — some cool white, some warm
      p.rotationSpeed = rand(0, 1);
      return p;
    },
    update: (p, dt) => {
      p.life += dt;
      // Twinkle: slow main pulse with a quick shimmer on top
      const pulse = Math.sin(p.life * 1.5 + p.rotation);
      const shimmer = Math.sin(p.life * 6 + p.rotation * 3) * 0.15;
      p.opacity = 0.35 + pulse * 0.35 + shimmer;
      return p.life < p.maxLife;
    },
    draw: (ctx, p) => {
      // Mix between cool silver-white and warm golden based on per-star warmth
      const warmth = p.rotationSpeed;
      const sr = Math.floor(180 + warmth * 60);
      const sg = Math.floor(190 + warmth * 40);
      const sb = Math.floor(220 - warmth * 60);
      const alpha = p.opacity * 0.8;
      ctx.save();
      ctx.translate(p.x, p.y);
      // Draw 4-point star with cross rays
      const outerR = p.size * 1.8;
      const innerR = p.size * 0.35;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const outerAngle = (i * Math.PI) / 2 - Math.PI / 2;
        const innerAngle = outerAngle + Math.PI / 4;
        ctx.lineTo(
          Math.cos(outerAngle) * outerR,
          Math.sin(outerAngle) * outerR
        );
        ctx.lineTo(
          Math.cos(innerAngle) * innerR,
          Math.sin(innerAngle) * innerR
        );
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${sr},${sg},${sb},${alpha})`;
      ctx.fill();
      // Cross-shaped light diffraction rays (subtle)
      if (p.size > 2) {
        const rayLen = p.size * 3;
        const rayAlpha = alpha * 0.25;
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},${rayAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-rayLen, 0);
        ctx.lineTo(rayLen, 0);
        ctx.moveTo(0, -rayLen);
        ctx.lineTo(0, rayLen);
        ctx.stroke();
      }
      // Bright center point
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.9})`;
      ctx.fill();
      ctx.restore();
    },
  },
};

export function getEffectBehavior(
  effectId: string
): EffectBehavior | undefined {
  return EFFECT_BEHAVIORS[effectId];
}
