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
  private lastUpdate = 0;
  private isInitialized = false;

  public update(rawX: number, rawY: number): { x: number; y: number; isTeleport: boolean } {
    const now = performance.now();

    if (!this.isInitialized) {
      this.currentX = rawX;
      this.currentY = rawY;
      this.lastUpdate = now;
      this.isInitialized = true;
      return { x: rawX, y: rawY, isTeleport: true };
    }

    const dist = Math.hypot(rawX - this.currentX, rawY - this.currentY);
    const dt = now - this.lastUpdate;

    // If point hopped too far or tracking dropped for > 160ms, reset without connecting!
    if (dist > MAX_POINT_CONNECT_DISTANCE || dt > 160) {
      this.currentX = rawX;
      this.currentY = rawY;
      this.lastUpdate = now;
      return { x: rawX, y: rawY, isTeleport: true };
    }

    // Exponential smoothing factor: 0.75 for responsiveness, 0.25 history
    this.currentX = this.currentX * 0.25 + rawX * 0.75;
    this.currentY = this.currentY * 0.25 + rawY * 0.75;
    this.lastUpdate = now;

    return { x: this.currentX, y: this.currentY, isTeleport: false };
  }

  public getPointer(): SmoothedPointer {
    const now = performance.now();
    return {
      x: this.currentX,
      y: this.currentY,
      lastUpdate: this.lastUpdate,
      isActive: this.isInitialized && now - this.lastUpdate < 200,
    };
  }

  public reset(): void {
    this.isInitialized = false;
  }
}
