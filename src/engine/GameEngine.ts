import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BladePoint, GameMode, GameStats, PlayerSide, WasteCategory } from '../types/game';
import {
  checkLineCircleIntersect,
  isValidSliceSegment,
  canPlayerSliceItem,
  MAX_POINT_CONNECT_DISTANCE,
} from './CollisionEngine';
import { sound } from '../audio/SoundService';
import { PointerSmoother } from './PointerSmoother';

export const WASTE_CATEGORIES: Record<string, WasteCategory> = {
  PLASTIC: {
    id: 'plastic',
    name: 'Plastik',
    category: 'PLASTIK',
    color: '#0284c7',
    glowColor: 'rgba(2, 132, 199, 0.4)',
    points: 100,
    co2: 0.3,
    radius: 52,
    isBomb: false,
  },
  PAPER: {
    id: 'paper',
    name: 'Kardus',
    category: 'KERTAS',
    color: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    points: 100,
    co2: 0.4,
    radius: 54,
    isBomb: false,
  },
  METAL: {
    id: 'metal',
    name: 'Logam',
    category: 'LOGAM',
    color: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.4)',
    points: 150,
    co2: 0.8,
    radius: 50,
    isBomb: false,
  },
  ORGANIC: {
    id: 'organic',
    name: 'Organik',
    category: 'ORGANIK',
    color: '#16a34a',
    glowColor: 'rgba(22, 163, 74, 0.4)',
    points: 80,
    co2: 0.2,
    radius: 48,
    isBomb: false,
  },
  EWASTE: {
    id: 'ewaste',
    name: 'Khusus',
    category: 'KHUSUS',
    color: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.4)',
    points: 200,
    co2: 1.2,
    radius: 52,
    isBomb: false,
  },
  B3_BOMB: {
    id: 'b3',
    name: 'Limbah B3',
    category: 'BAHAYA',
    color: '#ef4444',
    glowColor: 'rgba(239, 68, 68, 0.5)',
    points: 0,
    co2: 0,
    radius: 58,
    isBomb: true,
  },
};

const SPAWN_POOL = [
  WASTE_CATEGORIES.PLASTIC,
  WASTE_CATEGORIES.PLASTIC,
  WASTE_CATEGORIES.PAPER,
  WASTE_CATEGORIES.PAPER,
  WASTE_CATEGORIES.METAL,
  WASTE_CATEGORIES.ORGANIC,
  WASTE_CATEGORIES.EWASTE,
  WASTE_CATEGORIES.B3_BOMB,
];

interface ActiveItem {
  id: number;
  type: WasteCategory;
  side: PlayerSide;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  radius: number;
  sliced: boolean;
  container: Container;
}

interface SlicedHalf {
  type: WasteCategory;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  sliceAngle: number;
  isLeft: boolean;
  alpha: number;
  graphics: Graphics;
}

interface ActiveParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  radius: number;
  color: string;
  graphics: Graphics;
}

interface ActiveText {
  text: Text;
  y: number;
  vy: number;
  alpha: number;
}

export type { GameStats };

export interface GameEngineCallbacks {
  onScoreUpdate: (stats: {
    solo: GameStats;
    p1: GameStats;
    p2: GameStats;
    timeLeft: number;
  }) => void;
  onGameOver: (result: {
    mode: GameMode;
    winnerTitle: string;
    solo: GameStats;
    p1: GameStats;
    p2: GameStats;
  }) => void;
}

export class GameEngine {
  private app: Application;
  private gameMode: GameMode = 'SOLO';
  public isRunning = false;
  private timeLeft = 60;
  private timerInterval: NodeJS.Timeout | null = null;
  private nextItemId = 1;

  // Pixi Layers
  private arenaLayer = new Container();
  private itemsLayer = new Container();
  private halvesLayer = new Container();
  private particleLayer = new Container();
  private bladeLayer = new Container();
  private reticleLayer = new Container();
  private textLayer = new Container();

  // Active Entities
  private items: ActiveItem[] = [];
  private halves: SlicedHalf[] = [];
  private particles: ActiveParticle[] = [];
  private floatTexts: ActiveText[] = [];

  // Pointers & Trails
  private soloSmoother = new PointerSmoother();
  private p1Smoother = new PointerSmoother();
  private p2Smoother = new PointerSmoother();

  private soloBladePoints: BladePoint[] = [];
  private p1BladePoints: BladePoint[] = [];
  private p2BladePoints: BladePoint[] = [];

  // Metrics
  private soloStats: GameStats = { score: 0, co2: 0, lives: 3, maxCombo: 0 };
  private p1Stats: GameStats = { score: 0, co2: 0, lives: 3, maxCombo: 0 };
  private p2Stats: GameStats = { score: 0, co2: 0, lives: 3, maxCombo: 0 };

  private soloCombo = 0;
  private soloLastCut = 0;
  private p1Combo = 0;
  private p1LastCut = 0;
  private p2Combo = 0;
  private p2LastCut = 0;

  private spawnCooldown = 0;
  private callbacks: GameEngineCallbacks;

  constructor(app: Application, callbacks: GameEngineCallbacks) {
    this.app = app;
    this.callbacks = callbacks;

    // Build scene hierarchy
    this.app.stage.addChild(this.arenaLayer);
    this.app.stage.addChild(this.itemsLayer);
    this.app.stage.addChild(this.halvesLayer);
    this.app.stage.addChild(this.particleLayer);
    this.app.stage.addChild(this.bladeLayer);
    this.app.stage.addChild(this.reticleLayer);
    this.app.stage.addChild(this.textLayer);

    // Register 60/120 FPS game ticker
    this.app.ticker.add((ticker) => {
      this.update(ticker.deltaTime);
    });
  }

  public setMode(mode: GameMode): void {
    this.gameMode = mode;
    this.drawArenaPartition();
  }

  public start(mode: GameMode): void {
    sound.init();
    sound.playWhoosh();

    this.gameMode = mode;
    this.isRunning = true;
    this.timeLeft = 60;

    // Reset Metrics
    this.soloStats = { score: 0, co2: 0, lives: 3, maxCombo: 0 };
    this.p1Stats = { score: 0, co2: 0, lives: 3, maxCombo: 0 };
    this.p2Stats = { score: 0, co2: 0, lives: 3, maxCombo: 0 };

    this.soloCombo = 0;
    this.p1Combo = 0;
    this.p2Combo = 0;

    this.soloBladePoints = [];
    this.p1BladePoints = [];
    this.p2BladePoints = [];

    this.soloSmoother.reset();
    this.p1Smoother.reset();
    this.p2Smoother.reset();

    this.clearAllEntities();
    this.drawArenaPartition();
    this.emitStats();

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isRunning) return;
      this.timeLeft--;
      this.emitStats();
      if (this.timeLeft <= 0) {
        let winner = 'Waktu Habis';
        if (this.gameMode === 'VERSUS') {
          if (this.p1Stats.score > this.p2Stats.score) winner = 'Player 1 Menang!';
          else if (this.p2Stats.score > this.p1Stats.score) winner = 'Player 2 Menang!';
          else winner = 'Hasil Seri (Draw)!';
        }
        this.stop(winner);
      }
    }, 1000);
  }

  public stop(winnerTitle: string): void {
    this.isRunning = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
    sound.playFanfare();

    this.callbacks.onGameOver({
      mode: this.gameMode,
      winnerTitle,
      solo: { ...this.soloStats },
      p1: { ...this.p1Stats },
      p2: { ...this.p2Stats },
    });
  }

  public inputPointer(rawX: number, rawY: number, player: PlayerSide = 'SOLO'): void {
    if (!this.isRunning) return;

    if (player === 'P1') {
      const { x, y, isTeleport } = this.p1Smoother.update(rawX, rawY);
      this.addBladePoint(x, y, 'P1', isTeleport);
    } else if (player === 'P2') {
      const { x, y, isTeleport } = this.p2Smoother.update(rawX, rawY);
      this.addBladePoint(x, y, 'P2', isTeleport);
    } else {
      const { x, y, isTeleport } = this.soloSmoother.update(rawX, rawY);
      this.addBladePoint(x, y, 'SOLO', isTeleport);
    }
  }

  private addBladePoint(x: number, y: number, player: PlayerSide, isTeleport: boolean): void {
    sound.playWhoosh(player === 'P2' ? 1.25 : 1.0);

    const arr = player === 'P1' ? this.p1BladePoints : player === 'P2' ? this.p2BladePoints : this.soloBladePoints;
    const now = performance.now();

    // Guard against rope bug: teleport or distance spike clears trail sequence
    if (isTeleport && arr.length > 0) {
      arr.length = 0;
    } else if (arr.length > 0) {
      const last = arr[arr.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > MAX_POINT_CONNECT_DISTANCE) {
        arr.length = 0;
      }
    }

    arr.push({ x, y, time: now });
    if (arr.length > 14) arr.shift();

    this.checkCollisions(player, arr);
  }

  private checkCollisions(player: PlayerSide, points: BladePoint[]): void {
    if (points.length < 2) return;

    const p1 = points[points.length - 2];
    const p2 = points[points.length - 1];

    if (!isValidSliceSegment(p1, p2)) return;

    const sliceAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    for (const item of this.items) {
      if (item.sliced) continue;
      if (!canPlayerSliceItem(player, item.side, this.gameMode)) continue;

      if (checkLineCircleIntersect(p1.x, p1.y, p2.x, p2.y, item.x, item.y, item.radius)) {
        this.sliceItem(item, sliceAngle, player);
      }
    }
  }

  private sliceItem(item: ActiveItem, angle: number, player: PlayerSide): void {
    item.sliced = true;
    item.container.visible = false;

    // BOMB LOGIC
    if (item.type.isBomb) {
      sound.playExplosion();
      this.spawnParticles(item.x, item.y, '#ef4444', 35);

      if (player === 'P1') {
        this.p1Stats.lives--;
        this.spawnFloatingText(item.x, item.y, 'P1 BOM B3! -1 NYAWA', '#ef4444');
        if (this.p1Stats.lives <= 0) this.stop('Player 2 Menang!');
      } else if (player === 'P2') {
        this.p2Stats.lives--;
        this.spawnFloatingText(item.x, item.y, 'P2 BOM B3! -1 NYAWA', '#ef4444');
        if (this.p2Stats.lives <= 0) this.stop('Player 1 Menang!');
      } else {
        this.soloStats.lives--;
        this.spawnFloatingText(item.x, item.y, 'BOM B3! -1 NYAWA', '#ef4444');
        if (this.soloStats.lives <= 0) this.stop('Habis Nyawa');
      }
      this.emitStats();
      return;
    }

    // RECYCLABLE REWARD
    const now = performance.now();
    let combo = 1;

    if (player === 'P1') {
      if (now - this.p1LastCut < 350) this.p1Combo++;
      else this.p1Combo = 1;
      this.p1LastCut = now;
      if (this.p1Combo > this.p1Stats.maxCombo) this.p1Stats.maxCombo = this.p1Combo;
      combo = this.p1Combo;
    } else if (player === 'P2') {
      if (now - this.p2LastCut < 350) this.p2Combo++;
      else this.p2Combo = 1;
      this.p2LastCut = now;
      if (this.p2Combo > this.p2Stats.maxCombo) this.p2Stats.maxCombo = this.p2Combo;
      combo = this.p2Combo;
    } else {
      if (now - this.soloLastCut < 350) this.soloCombo++;
      else this.soloCombo = 1;
      this.soloLastCut = now;
      if (this.soloCombo > this.soloStats.maxCombo) this.soloStats.maxCombo = this.soloCombo;
      combo = this.soloCombo;
    }

    const pitchMod = player === 'P2' ? 1.25 : 1.0;
    sound.playSlice(pitchMod + combo * 0.08);

    // Spawn Halves
    this.spawnHalf(item, angle, true);
    this.spawnHalf(item, angle, false);

    // Spawn Particles
    this.spawnParticles(item.x, item.y, item.type.color, 20);

    let multiplier = 1;
    if (combo >= 3) {
      multiplier = combo;
      sound.playCombo(combo, pitchMod);
      this.spawnFloatingText(item.x, item.y - 28, `${combo}x COMBO!`, '#fbbf24');
    }

    const earned = item.type.points * multiplier;
    if (player === 'P1') {
      this.p1Stats.score += earned;
      this.p1Stats.co2 += item.type.co2;
      this.spawnFloatingText(item.x, item.y, `+${earned}`, '#34d399');
    } else if (player === 'P2') {
      this.p2Stats.score += earned;
      this.p2Stats.co2 += item.type.co2;
      this.spawnFloatingText(item.x, item.y, `+${earned}`, '#38bdf8');
    } else {
      this.soloStats.score += earned;
      this.soloStats.co2 += item.type.co2;
      this.spawnFloatingText(item.x, item.y, `+${earned}`, item.type.color);
    }

    this.emitStats();
  }

  private update(dt: number): void {
    if (this.isRunning) {
      this.handleSpawning(dt);
      this.updateItems(dt);
      this.updateHalves(dt);
      this.updateParticles(dt);
      this.updateFloatTexts(dt);
    }

    this.renderBlades();
    this.renderReticles();
  }

  private handleSpawning(dt: number): void {
    this.spawnCooldown -= dt * 16.6;
    if (this.spawnCooldown <= 0) {
      if (this.gameMode === 'VERSUS') {
        const pair = SPAWN_POOL[Math.floor(Math.random() * SPAWN_POOL.length)];
        this.createItem('P1', pair);
        this.createItem('P2', pair);
        this.spawnCooldown = 1300 + Math.random() * 700;
      } else {
        const item = SPAWN_POOL[Math.floor(Math.random() * SPAWN_POOL.length)];
        this.createItem('SOLO', item);
        this.spawnCooldown = 1000 + Math.random() * 800;
      }
    }
  }

  private createItem(side: PlayerSide, type: WasteCategory): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;

    let x = 0;
    let targetX = 0;
    let vx = 0;

    if (side === 'P1') {
      x = width * (0.08 + Math.random() * 0.34);
      targetX = width * 0.25 + (Math.random() - 0.5) * (width * 0.16);
      vx = (targetX - x) / (45 + Math.random() * 10);
    } else if (side === 'P2') {
      x = width * (0.58 + Math.random() * 0.34);
      targetX = width * 0.75 + (Math.random() - 0.5) * (width * 0.16);
      vx = (targetX - x) / (45 + Math.random() * 10);
    } else {
      x = width * (0.15 + Math.random() * 0.7);
      targetX = width * 0.5 + (Math.random() - 0.5) * (width * 0.35);
      vx = (targetX - x) / (45 + Math.random() * 12);
    }

    const container = new Container();
    const gfx = new Graphics();

    // Outer soft halo
    gfx.circle(0, 0, type.radius + 4);
    gfx.stroke({ width: 5, color: type.color, alpha: 0.35 });

    // Inner filled circle
    gfx.circle(0, 0, type.radius);
    gfx.fill({ color: 0x0f172a, alpha: 0.94 });
    gfx.stroke({ width: 3.5, color: type.color });

    container.addChild(gfx);

    // Label Text
    const label = new Text({
      text: type.name.toUpperCase(),
      style: new TextStyle({
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        fontWeight: '800',
        fill: type.color,
      }),
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, type.radius - 14);
    container.addChild(label);

    container.position.set(x, height + type.radius + 10);
    this.itemsLayer.addChild(container);

    this.items.push({
      id: this.nextItemId++,
      type,
      side,
      x,
      y: height + type.radius + 10,
      vx,
      vy: -(14 + Math.random() * 5),
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.08,
      radius: type.radius,
      sliced: false,
      container,
    });
  }

  private updateItems(dt: number): void {
    const height = this.app.screen.height;
    const width = this.app.screen.width;

    this.items = this.items.filter((item) => {
      if (item.sliced) {
        this.itemsLayer.removeChild(item.container);
        item.container.destroy();
        return false;
      }

      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vy += 0.32 * dt;
      item.rotation += item.vRot * dt;

      // Arena boundary bounce in versus
      if (item.side === 'P1') {
        if (item.x > width * 0.48 && item.vx > 0) item.vx *= -0.7;
        if (item.x < width * 0.04 && item.vx < 0) item.vx *= -0.7;
      } else if (item.side === 'P2') {
        if (item.x < width * 0.52 && item.vx < 0) item.vx *= -0.7;
        if (item.x > width * 0.96 && item.vx > 0) item.vx *= -0.7;
      }

      item.container.position.set(item.x, item.y);
      item.container.rotation = item.rotation;

      if (item.vy > 0 && item.y > height + 80) {
        this.itemsLayer.removeChild(item.container);
        item.container.destroy();
        return false;
      }
      return true;
    });
  }

  private spawnHalf(item: ActiveItem, sliceAngle: number, isLeft: boolean): void {
    const normal = sliceAngle + (isLeft ? -Math.PI / 2 : Math.PI / 2);
    const impulse = 3.5 + Math.random() * 2;

    const gfx = new Graphics();
    gfx.arc(0, 0, item.radius, isLeft ? -Math.PI / 2 : Math.PI / 2, isLeft ? Math.PI / 2 : (3 * Math.PI) / 2);
    gfx.fill({ color: 0x0f172a, alpha: 0.94 });
    gfx.stroke({ width: 3.5, color: item.type.color });

    gfx.position.set(item.x, item.y);
    this.halvesLayer.addChild(gfx);

    this.halves.push({
      type: item.type,
      x: item.x,
      y: item.y,
      vx: item.vx * 0.5 + Math.cos(normal) * impulse,
      vy: item.vy * 0.5 + Math.sin(normal) * impulse,
      rotation: item.rotation,
      vRot: (isLeft ? -1 : 1) * (0.08 + Math.random() * 0.08),
      sliceAngle,
      isLeft,
      alpha: 1,
      graphics: gfx,
    });
  }

  private updateHalves(dt: number): void {
    const height = this.app.screen.height;

    this.halves = this.halves.filter((half) => {
      half.x += half.vx * dt;
      half.y += half.vy * dt;
      half.vy += 0.38 * dt;
      half.rotation += half.vRot * dt;
      half.alpha -= 0.018 * dt;

      half.graphics.position.set(half.x, half.y);
      half.graphics.rotation = half.rotation;
      half.graphics.alpha = Math.max(0, half.alpha);

      if (half.alpha <= 0 || half.y > height + 100) {
        this.halvesLayer.removeChild(half.graphics);
        half.graphics.destroy();
        return false;
      }
      return true;
    });
  }

  private spawnParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 7;
      const gfx = new Graphics();
      const radius = 2 + Math.random() * 4;

      gfx.circle(0, 0, radius);
      gfx.fill({ color });
      gfx.position.set(x, y);

      this.particleLayer.addChild(gfx);

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        radius,
        color,
        graphics: gfx,
      });
    }
  }

  private updateParticles(dt: number): void {
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.15 * dt;
      p.alpha -= 0.025 * dt;

      p.graphics.position.set(p.x, p.y);
      p.graphics.alpha = Math.max(0, p.alpha);

      if (p.alpha <= 0) {
        this.particleLayer.removeChild(p.graphics);
        p.graphics.destroy();
        return false;
      }
      return true;
    });
  }

  private spawnFloatingText(x: number, y: number, textString: string, color: string): void {
    const text = new Text({
      text: textString,
      style: new TextStyle({
        fontFamily: 'Manrope, sans-serif',
        fontSize: 18,
        fontWeight: '800',
        fill: color,
        stroke: { color: 0x000000, width: 4 },
      }),
    });
    text.anchor.set(0.5, 0.5);
    text.position.set(x, y);
    this.textLayer.addChild(text);

    this.floatTexts.push({
      text,
      y,
      vy: -2.2,
      alpha: 1,
    });
  }

  private updateFloatTexts(dt: number): void {
    this.floatTexts = this.floatTexts.filter((t) => {
      t.y += t.vy * dt;
      t.alpha -= 0.02 * dt;

      t.text.position.y = t.y;
      t.text.alpha = Math.max(0, t.alpha);

      if (t.alpha <= 0) {
        this.textLayer.removeChild(t.text);
        t.text.destroy();
        return false;
      }
      return true;
    });
  }

  private renderBlades(): void {
    this.bladeLayer.removeChildren();

    const now = performance.now();
    const prune = (arr: BladePoint[]) => arr.filter((pt) => now - pt.time < 180);

    this.soloBladePoints = prune(this.soloBladePoints);
    this.p1BladePoints = prune(this.p1BladePoints);
    this.p2BladePoints = prune(this.p2BladePoints);

    if (this.gameMode === 'VERSUS') {
      this.drawSingleBlade(this.p1BladePoints, '#10b981', 0x10b981);
      this.drawSingleBlade(this.p2BladePoints, '#0284c7', 0x0284c7);
    } else {
      this.drawSingleBlade(this.soloBladePoints, '#10b981', 0x10b981);
    }
  }

  private drawSingleBlade(points: BladePoint[], _colorStr: string, hexColor: number): void {
    if (points.length < 2) return;

    const gfx = new Graphics();

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist > MAX_POINT_CONNECT_DISTANCE) continue;

      const progress = i / points.length;

      // Outer halo
      gfx.moveTo(p1.x, p1.y);
      gfx.lineTo(p2.x, p2.y);
      gfx.stroke({ width: progress * 20 + 6, color: hexColor, alpha: 0.25, cap: 'round' });

      // Main core blade
      gfx.moveTo(p1.x, p1.y);
      gfx.lineTo(p2.x, p2.y);
      gfx.stroke({ width: progress * 10 + 3, color: 0xffffff, alpha: 0.9, cap: 'round' });
    }

    this.bladeLayer.addChild(gfx);
  }

  private renderReticles(): void {
    this.reticleLayer.removeChildren();

    const now = performance.now();
    const pulse = Math.sin(now * 0.008) * 3;

    if (this.gameMode === 'VERSUS') {
      const p1 = this.p1Smoother.getPointer();
      const p2 = this.p2Smoother.getPointer();

      if (p1.isActive) this.drawReticle(p1.x, p1.y, 0x10b981, pulse);
      if (p2.isActive) this.drawReticle(p2.x, p2.y, 0x0284c7, pulse);
    } else {
      const solo = this.soloSmoother.getPointer();
      if (solo.isActive) this.drawReticle(solo.x, solo.y, 0x10b981, pulse);
    }
  }

  private drawReticle(x: number, y: number, color: number, pulse: number): void {
    const gfx = new Graphics();
    const radius = 22 + pulse;

    // Outer ring
    gfx.circle(x, y, radius);
    gfx.stroke({ width: 3, color, alpha: 0.85 });

    // Inner bright spark
    gfx.circle(x, y, 5);
    gfx.fill({ color: 0xffffff });

    this.reticleLayer.addChild(gfx);
  }

  private drawArenaPartition(): void {
    this.arenaLayer.removeChildren();
    if (this.gameMode !== 'VERSUS') return;

    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const midX = width / 2;

    const gfx = new Graphics();
    gfx.moveTo(midX, 60);
    gfx.lineTo(midX, height);
    gfx.stroke({ width: 2.5, color: 0xffffff, alpha: 0.25 });

    this.arenaLayer.addChild(gfx);
  }

  private clearAllEntities(): void {
    for (const item of this.items) item.container.destroy();
    for (const half of this.halves) half.graphics.destroy();
    for (const p of this.particles) p.graphics.destroy();
    for (const t of this.floatTexts) t.text.destroy();

    this.items = [];
    this.halves = [];
    this.particles = [];
    this.floatTexts = [];

    this.itemsLayer.removeChildren();
    this.halvesLayer.removeChildren();
    this.particleLayer.removeChildren();
    this.bladeLayer.removeChildren();
    this.reticleLayer.removeChildren();
    this.textLayer.removeChildren();
  }

  private emitStats(): void {
    this.callbacks.onScoreUpdate({
      solo: { ...this.soloStats },
      p1: { ...this.p1Stats },
      p2: { ...this.p2Stats },
      timeLeft: this.timeLeft,
    });
  }
}
