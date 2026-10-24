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

interface MediaPipeHandsInstance {
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
}

interface WindowMediaPipe extends Window {
  Hands?: new (options: { locateFile: (file: string) => string }) => MediaPipeHandsInstance;
}

export class VisionService {
  private video: HTMLVideoElement | null = null;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private handTracker: MediaPipeHandsInstance | null = null;
  private isProcessing = false;
  private isActive = true;
  private callbacks: Set<VisionCallback> = new Set();
  public isCameraReady = false;
  public gameMode: GameMode = 'SOLO';

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    // Optimal downscaled tensor resolution (360x202) for MediaPipe internal 224x224 input
    this.offscreenCanvas.width = 360;
    this.offscreenCanvas.height = 202;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }

  public onLandmarks(cb: VisionCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  public setMode(mode: GameMode): void {
    this.gameMode = mode;
    if (this.handTracker) {
      // Dynamic hand allocation: Solo strictly 1 hand (50% CPU savings!), Versus 2 hands
      this.handTracker.setOptions({
        maxNumHands: mode === 'VERSUS' ? 2 : 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.3,
        minTrackingConfidence: 0.3,
      });
    }
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
      this.handTracker = new win.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      this.handTracker.setOptions({
        maxNumHands: this.gameMode === 'VERSUS' ? 2 : 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.3,
        minTrackingConfidence: 0.3,
      });

      this.handTracker.onResults((results) => {
        this.isProcessing = false;
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          this.dispatchLandmarks(results.multiHandLandmarks);
        }
      });

      // Start webcam via native Web API (Zero requestAnimationFrame contention)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.video.srcObject = stream;
      await this.video.play();
      this.isCameraReady = true;

      // Start Decoupled Async Inference Loop
      // Runs in its own macro-task loop — NEVER locks or delays PixiJS 60 FPS requestAnimationFrame!
      this.startDecoupledLoop();
      return true;
    } catch (err) {
      console.warn('Camera / Hands initialization error:', err);
      this.isCameraReady = false;
      return false;
    }
  }

  private startDecoupledLoop(): void {
    const runInference = async () => {
      if (!this.isActive) return;

      if (!this.isProcessing && this.video && this.video.readyState >= 2 && this.handTracker && this.offscreenCtx) {
        this.isProcessing = true;
        try {
          this.offscreenCtx.drawImage(this.video, 0, 0, 360, 202);
          await this.handTracker.send({ image: this.offscreenCanvas });
        } catch {
          this.isProcessing = false;
        }
      }

      // Schedule next inference at ~30 FPS cadence (every 33ms)
      setTimeout(runInference, 33);
    };

    runInference();
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
