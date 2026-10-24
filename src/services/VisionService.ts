import type { GameMode } from '../types/game';

export interface HandPosition {
  x: number;
  y: number;
}

export interface VisionPacket {
  soloHand?: HandPosition;
  p1Hand?: HandPosition;
  p2Hand?: HandPosition;
}

export type VisionCallback = (packet: VisionPacket) => void;

interface WindowMediaPipe extends Window {
  Hands?: new (options: { locateFile: (file: string) => string }) => {
    setOptions: (opts: {
      maxNumHands: number;
      modelComplexity: number;
      minDetectionConfidence: number;
      minTrackingConfidence: number;
    }) => void;
    onResults: (
      cb: (results: {
        image: HTMLCanvasElement;
        multiHandLandmarks?: Array<Array<{ x: number; y: number }>>;
      }) => void
    ) => void;
    send: (input: { image: HTMLCanvasElement }) => Promise<void>;
  };
  Camera?: new (
    video: HTMLVideoElement,
    options: {
      onFrame: () => Promise<void>;
      width: number;
      height: number;
    }
  ) => {
    start: () => Promise<void>;
  };
}

export class VisionService {
  private video: HTMLVideoElement | null = null;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private isProcessing = false;
  private isActive = true;
  private callbacks: Set<VisionCallback> = new Set();
  public isCameraReady = false;
  public gameMode: GameMode = 'SOLO';

  private lastInferTime = 0;

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    // Optimal downscaled tensor resolution for MediaPipe Hands (360x202)
    this.offscreenCanvas.width = 360;
    this.offscreenCanvas.height = 202;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }

  public onLandmarks(cb: VisionCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  public async start(videoElement: HTMLVideoElement): Promise<boolean> {
    this.video = videoElement;
    window.alert = console.warn;

    const win = window as unknown as WindowMediaPipe;
    if (!win.Hands) {
      console.warn('MediaPipe Hands CDN not found on window.');
      return false;
    }

    try {
      const handTracker = new win.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      // Ultra-fast Lite Model (modelComplexity: 0) uses ~5ms CPU per frame instead of 35ms!
      handTracker.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.3,
        minTrackingConfidence: 0.3,
      });

      handTracker.onResults((results) => {
        this.isProcessing = false;
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          this.dispatchLandmarks(results.multiHandLandmarks);
        }
      });

      if (win.Camera) {
        const camera = new win.Camera(this.video, {
          onFrame: async () => {
            const now = performance.now();
            // Throttle inference to 30 FPS (every 32ms) to leave 50%+ CPU headroom for 60-120 FPS game rendering
            if (this.isActive && !this.isProcessing && this.video && this.video.readyState >= 2 && now - this.lastInferTime >= 32) {
              this.isProcessing = true;
              this.lastInferTime = now;
              if (this.offscreenCtx) {
                this.offscreenCtx.drawImage(this.video, 0, 0, 360, 202);
                await handTracker.send({ image: this.offscreenCanvas });
              } else {
                this.isProcessing = false;
              }
            }
          },
          width: 640,
          height: 360,
        });

        await camera.start();
        this.isCameraReady = true;
        return true;
      }

      return false;
    } catch (err) {
      console.warn('Camera / Hands initialization error:', err);
      this.isCameraReady = false;
      return false;
    }
  }

  private dispatchLandmarks(allHandsLandmarks: Array<Array<{ x: number; y: number }>>): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const packet: VisionPacket = {};

    if (this.gameMode === 'VERSUS') {
      let bestP1: HandPosition | null = null;
      let bestP2: HandPosition | null = null;

      for (const landmarks of allHandsLandmarks) {
        const pt = landmarks[8] || landmarks[12] || landmarks[9] || landmarks[0];
        if (!pt) continue;

        const screenX = (1 - pt.x) * width;
        const screenY = pt.y * height;

        if (screenX < width / 2) {
          if (!bestP1 || screenX < bestP1.x) {
            bestP1 = { x: screenX, y: screenY };
          }
        } else {
          if (!bestP2 || screenX > bestP2.x) {
            bestP2 = { x: screenX, y: screenY };
          }
        }
      }

      if (bestP1) packet.p1Hand = bestP1;
      if (bestP2) packet.p2Hand = bestP2;
    } else {
      const firstHand = allHandsLandmarks[0];
      if (firstHand) {
        const pt = firstHand[8] || firstHand[12] || firstHand[9] || firstHand[0];
        if (pt) {
          packet.soloHand = {
            x: (1 - pt.x) * width,
            y: pt.y * height,
          };
        }
      }
    }

    for (const cb of this.callbacks) {
      cb(packet);
    }
  }

  public toggleCamera(): boolean {
    this.isActive = !this.isActive;
    return this.isActive;
  }
}

export const visionService = new VisionService();
