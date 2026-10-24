import { MAX_POINT_CONNECT_DISTANCE } from './CollisionEngine';

export interface SmoothedPointer {
  x: number;
  y: number;
  lastUpdate: number;
  isActive: boolean;
}

export class PointerSmoother {
  private currentX = 0;
  private currentY = 0;
  private vx = 0;
  private vy = 0;
  private lastUpdate = 0;
  private isInitialized = false;

  public update(rawX: number, rawY: number): { x: number; y: number; isTeleport: boolean } {
    const now = performance.now();

    if (!this.isInitialized) {
      this.currentX = rawX;
      this.currentY = rawY;
      this.vx = 0;
      this.vy = 0;
      this.lastUpdate = now;
      this.isInitialized = true;
      return { x: rawX, y: rawY, isTeleport: true };
    }

    const dist = Math.hypot(rawX - this.currentX, rawY - this.currentY);
    const dt = Math.max(1, now - this.lastUpdate);

    // If point hopped too far or tracking dropped for > 220ms, reset without connecting!
    if (dist > MAX_POINT_CONNECT_DISTANCE || dt > 220) {
      this.currentX = rawX;
      this.currentY = rawY;
      this.vx = 0;
      this.vy = 0;
      this.lastUpdate = now;
      return { x: rawX, y: rawY, isTeleport: true };
    }

    // Measure velocity vector (px/ms)
    const instantVx = (rawX - this.currentX) / dt;
    const instantVy = (rawY - this.currentY) / dt;
    this.vx = this.vx * 0.35 + instantVx * 0.65;
    this.vy = this.vy * 0.35 + instantVy * 0.65;

    // Responsive exponential smoothing: 0.82 responsiveness, 0.18 history
    this.currentX = this.currentX * 0.18 + rawX * 0.82;
    this.currentY = this.currentY * 0.18 + rawY * 0.82;
    this.lastUpdate = now;

    return { x: this.currentX, y: this.currentY, isTeleport: false };
  }

  /**
   * Applies momentum prediction if tracking dropped for 1-3 frames (30-95ms) during fast swing.
   */
  public getPredictedPointer(): SmoothedPointer {
    const now = performance.now();
    if (!this.isInitialized) {
      return { x: 0, y: 0, lastUpdate: 0, isActive: false };
    }

    const elapsed = now - this.lastUpdate;

    // Momentum Dead Reckoning: If lost for 30ms-95ms and was moving fast (>0.35 px/ms)
    const speed = Math.hypot(this.vx, this.vy);
    if (elapsed > 30 && elapsed < 95 && speed > 0.35) {
      const predX = this.currentX + this.vx * elapsed * 0.65;
      const predY = this.currentY + this.vy * elapsed * 0.65;
      return {
        x: predX,
        y: predY,
        lastUpdate: this.lastUpdate,
        isActive: true,
      };
    }

    return {
      x: this.currentX,
      y: this.currentY,
      lastUpdate: this.lastUpdate,
      isActive: elapsed < 220,
    };
  }

  public getPointer(): SmoothedPointer {
    return this.getPredictedPointer();
  }

  public reset(): void {
    this.isInitialized = false;
    this.vx = 0;
    this.vy = 0;
  }
}
