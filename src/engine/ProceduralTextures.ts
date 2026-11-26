import * as THREE from 'three';
import { TrackThemeId } from '../types/game';

function configureTexture(tex: THREE.CanvasTexture, anisotropy: number, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createRoadTexture(theme: TrackThemeId, anisotropy: number, repeatY: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (theme === 'cyber_tunnel') {
    // Deep midnight slate cyber road with luminous cyan/blue lane edge strips
    ctx.fillStyle = '#0c1630';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle micro-asphalt grain
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(56, 189, 248, 0.05)' : 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(x, y, 2, 6);
    }

    // Glowing side rails
    const leftGrad = ctx.createLinearGradient(0, 0, 36, 0);
    leftGrad.addColorStop(0, '#38bdf8');
    leftGrad.addColorStop(0.5, '#0284c7');
    leftGrad.addColorStop(1, 'rgba(2, 132, 199, 0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, 36, 512);

    const rightGrad = ctx.createLinearGradient(476, 0, 512, 0);
    rightGrad.addColorStop(0, 'rgba(2, 132, 199, 0)');
    rightGrad.addColorStop(0.5, '#0284c7');
    rightGrad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(476, 0, 36, 512);

    // Subtle center dashed lane markers
    ctx.fillStyle = 'rgba(125, 211, 252, 0.35)';
    for (let y = 24; y < 512; y += 128) {
      ctx.fillRect(172, y, 6, 56);
      ctx.fillRect(334, y, 6, 56);
    }
  } else if (theme === 'neon_grid') {
    // Synthwave violet-indigo road with glowing hot-magenta wireframe grid (Image 2)
    ctx.fillStyle = '#1b0938';
    ctx.fillRect(0, 0, 512, 512);

    // Longitudinal glow lines
    const cols = 6;
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * 512;
      ctx.strokeStyle = i === 0 || i === cols ? '#ff2eff' : 'rgba(232, 121, 249, 0.65)';
      ctx.lineWidth = i === 0 || i === cols ? 10 : 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }

    // Horizontal grid lines
    const rows = 4;
    for (let j = 0; j < rows; j++) {
      const y = (j / rows) * 512;
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.72)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Subtle cyan centerline glow
    ctx.fillStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.fillRect(253, 0, 6, 512);
  } else if (theme === 'forest_canopy') {
    // Warm sunlit terracotta/timber forest track (Image 4)
    ctx.fillStyle = '#d9822b';
    ctx.fillRect(0, 0, 512, 512);

    // Horizontal timber plank grain / racing surface striations
    for (let y = 0; y < 512; y += 16) {
      ctx.fillStyle = y % 32 === 0 ? 'rgba(146, 64, 14, 0.16)' : 'rgba(254, 215, 170, 0.08)';
      ctx.fillRect(0, y, 512, 3);
    }

    // Green & white forest curbs on edges
    ctx.fillStyle = '#4d7c0f';
    ctx.fillRect(0, 0, 22, 512);
    ctx.fillRect(490, 0, 22, 512);

    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(22, 0, 10, 512);
    ctx.fillRect(480, 0, 10, 512);

    // Dashed crisp white center line
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let y = 20; y < 512; y += 128) {
      ctx.fillRect(250, y, 12, 62);
    }
  } else if (theme === 'timber_valley') {
    // Vibrant highland green meadow track with crisp white 4-lane sprint lines (Image 5)
    ctx.fillStyle = '#5c9418';
    ctx.fillRect(0, 0, 512, 512);

    // Grass texture blades / grain
    for (let i = 0; i < 3500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(163, 230, 53, 0.22)' : 'rgba(54, 83, 20, 0.24)';
      ctx.fillRect(x, y, 3, 10);
    }

    // Wooden fence base border
    ctx.fillStyle = '#92400e';
    ctx.fillRect(0, 0, 18, 512);
    ctx.fillRect(494, 0, 18, 512);

    // Crisp white multi-lane track lines (like Image 5!)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    const laneXs = [36, 146, 256, 366, 476];
    for (const lx of laneXs) {
      ctx.fillRect(lx - 4, 0, 8, 512);
    }
  } else {
    // Sunset Grand Prix — dark textured motorsport asphalt with red/white apex curbs (Image 6)
    ctx.fillStyle = '#1e222d';
    ctx.fillRect(0, 0, 512, 512);

    // Asphalt noise & rubber grooves
    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.14)';
      ctx.fillRect(x, y, 2, 5);
    }

    // Subtle tire wear tracks
    ctx.fillStyle = 'rgba(10, 12, 18, 0.35)';
    ctx.fillRect(108, 0, 48, 512);
    ctx.fillRect(356, 0, 48, 512);

    // Red & white FIA rumble curbs
    for (let y = 0; y < 512; y += 64) {
      const isRed = (y / 64) % 2 === 0;
      ctx.fillStyle = isRed ? '#ef4444' : '#f8fafc';
      ctx.fillRect(0, y, 24, 64);
      ctx.fillRect(488, y, 24, 64);
    }

    // Warm gold dashed highway lines
    ctx.fillStyle = '#fbbf24';
    for (let y = 16; y < 512; y += 128) {
      ctx.fillRect(172, y, 7, 58);
      ctx.fillRect(333, y, 7, 58);
    }
  }

  return configureTexture(new THREE.CanvasTexture(canvas), anisotropy, 1, repeatY);
}

export function createTunnelTexture(theme: TrackThemeId, anisotropy: number, repeatY: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (theme === 'cyber_tunnel') {
    // Deep cobalt cosmic pixel-starfield tunnel (Image 1!)
    const bg = ctx.createLinearGradient(0, 0, 512, 0);
    bg.addColorStop(0, '#041236');
    bg.addColorStop(0.5, '#0b3b9e');
    bg.addColorStop(1, '#041236');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    // Pixel data-stream clusters
    for (let i = 0; i < 1600; i++) {
      const x = Math.floor(Math.random() * 64) * 8;
      const y = Math.floor(Math.random() * 64) * 8;
      const bright = Math.random();
      if (bright > 0.85) {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
      } else if (bright > 0.45) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.42)';
      } else {
        ctx.fillStyle = 'rgba(30, 64, 175, 0.55)';
      }
      ctx.fillRect(x, y, 8, 5);
    }

    // Dark structural rib rings
    ctx.fillStyle = 'rgba(4, 12, 32, 0.85)';
    ctx.fillRect(0, 0, 512, 18);
    ctx.fillRect(0, 256, 512, 14);
  } else if (theme === 'neon_grid') {
    // Neon purple/magenta grid with cyan/emerald speed bands (Image 2 & 3!)
    ctx.fillStyle = '#14062b';
    ctx.fillRect(0, 0, 512, 512);

    // Glowing vertical & horizontal neon grid
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 4;
    for (let x = 0; x <= 512; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 64) {
      ctx.strokeStyle = y % 128 === 0 ? '#2dd4bf' : '#d946ef';
      ctx.lineWidth = y % 128 === 0 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
  } else {
    // Sunset GP architectural highway tunnel with amber & cyan LED light bars
    ctx.fillStyle = '#131724';
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = '#1f2638';
    for (let x = 0; x < 512; x += 64) {
      ctx.fillRect(x, 0, 58, 512);
    }
    // Overhead warm LED light strips
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(190, 40, 132, 16);
    ctx.fillRect(190, 296, 132, 16);
    // Side safety neon stripes
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(16, 0, 10, 512);
    ctx.fillRect(486, 0, 10, 512);
  }

  return configureTexture(new THREE.CanvasTexture(canvas), anisotropy, 2, repeatY);
}

export function createBoostPadTexture(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 512);

  // Subtle translucent base
  ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
  ctx.fillRect(16, 0, 224, 512);

  // Glowing cyan/emerald forward chevron arrows (Image 3!)
  for (let i = 0; i < 4; i++) {
    const yBase = 48 + i * 124;
    ctx.beginPath();
    ctx.moveTo(32, yBase + 72);
    ctx.lineTo(128, yBase);
    ctx.lineTo(224, yBase + 72);
    ctx.lineTo(224, yBase + 106);
    ctx.lineTo(128, yBase + 36);
    ctx.lineTo(32, yBase + 106);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, yBase, 0, yBase + 106);
    grad.addColorStop(0, '#5eead4');
    grad.addColorStop(0.5, '#06b6d4');
    grad.addColorStop(1, '#e879f9');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createCheckeredTexture(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const size = 32;
  for (let y = 0; y < 128; y += size) {
    for (let x = 0; x < 512; x += size) {
      const even = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = even ? '#f8fafc' : '#090d16';
      ctx.fillRect(x, y, size, size);
    }
  }
  return configureTexture(new THREE.CanvasTexture(canvas), anisotropy, 2, 1);
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 256);

  const grad = ctx.createRadialGradient(64, 128, 12, 64, 128, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.save();
  ctx.scale(1, 1.9);
  ctx.translate(0, -60);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Live 3D Cockpit Digital Instrument Cluster CanvasTexture.
 * Updates smoothly during racing when Cockpit camera is active.
 */
export class CockpitDashDisplay {
  public readonly canvas: HTMLCanvasElement;
  public readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private lastDrawTime = 0;

  constructor(anisotropy: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = anisotropy;
    this.update(0, 0.1, 1, 100, 6, false);
  }

  public update(
    speedKmh: number,
    rpm: number,
    gear: number,
    nitro: number,
    pos: number,
    isNitro: boolean,
  ): void {
    const now = performance.now();
    if (now - this.lastDrawTime < 48) return; // ~20fps refresh on tiny dash screen saves CPU
    this.lastDrawTime = now;

    const ctx = this.ctx;
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, 512, 256);

    // Subtle bezel border
    ctx.strokeStyle = isNitro ? '#38bdf8' : '#1e293b';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 244);

    // RPM Bar segments across top
    const segs = 20;
    const activeSegs = Math.round(rpm * segs);
    for (let i = 0; i < segs; i++) {
      const x = 26 + i * 23;
      const h = 24 + (i / segs) * 20;
      const y = 66 - h;
      if (i < activeSegs) {
        if (i >= 16) ctx.fillStyle = '#ef4444';
        else if (i >= 11) ctx.fillStyle = '#f59e0b';
        else ctx.fillStyle = '#22c55e';
      } else {
        ctx.fillStyle = '#1e293b';
      }
      ctx.fillRect(x, y, 17, h);
    }

    // Center Gear indicator box
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(206, 86, 100, 108);
    ctx.strokeStyle = rpm > 0.88 ? '#ef4444' : '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(206, 86, 100, 108);

    ctx.fillStyle = rpm > 0.88 ? '#f87171' : '#f8fafc';
    ctx.font = 'bold 78px Oxanium, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(gear), 256, 144);

    // Left: Speed km/h
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('KM/H', 30, 108);

    ctx.fillStyle = isNitro ? '#38bdf8' : '#ffffff';
    ctx.font = 'bold 64px Oxanium, monospace';
    ctx.fillText(String(Math.round(speedKmh)).padStart(3, '0'), 28, 162);

    // Right: Position
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('POS', 482, 108);

    ctx.fillStyle = pos === 1 ? '#fbbf24' : '#f43f5e';
    ctx.font = 'bold 60px Oxanium, monospace';
    ctx.fillText(`P${pos}`, 482, 162);

    // Bottom NOS bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(28, 212, 456, 18);
    const nosGrad = ctx.createLinearGradient(28, 0, 484, 0);
    nosGrad.addColorStop(0, '#0284c7');
    nosGrad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = nosGrad;
    ctx.fillRect(28, 212, (456 * Math.max(0, Math.min(100, nitro))) / 100, 18);

    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
  }
}
