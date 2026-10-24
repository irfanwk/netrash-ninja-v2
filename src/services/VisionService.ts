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

export class VisionService {
  private worker: Worker | null = null;
  private video: HTMLVideoElement | null = null;
  private offscreenCanvas: OffscreenCanvas | HTMLCanvasElement;
  private offscreenCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  private isProcessing = false;
  private isActive = true;
  private callbacks: Set<VisionCallback> = new Set();
  public isCameraReady = false;
  public gameMode: GameMode = 'SOLO';

  constructor() {
    if (typeof OffscreenCanvas !== 'undefined') {
      this.offscreenCanvas = new OffscreenCanvas(480, 270);
    } else {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = 480;
      this.offscreenCanvas.height = 270;
    }
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true }) as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
  }

  public onLandmarks(cb: VisionCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  public async start(videoElement: HTMLVideoElement): Promise<boolean> {
    this.video = videoElement;

    // Suppress potential third-party modal alert
    window.alert = console.warn;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.video.srcObject = stream;
      await this.video.play();
      this.isCameraReady = true;

      this.initWorker();
      this.startFrameLoop();
      return true;
    } catch (err) {
      console.warn('Webcam access failed or permission denied:', err);
      this.isCameraReady = false;
      return false;
    }
  }

  private initWorker(): void {
    try {
      this.worker = new Worker(new URL('../workers/vision.worker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, landmarks } = e.data;
        this.isProcessing = false;

        if (type === 'LANDMARKS' && landmarks && landmarks.length > 0) {
          this.dispatchLandmarks(landmarks);
        }
      };

      this.worker.postMessage({ type: 'INIT' });
    } catch (workerErr) {
      console.warn('Web Worker initialization error:', workerErr);
    }
  }

  private startFrameLoop(): void {
    const process = async () => {
      if (!this.isActive) return;

      if (
        this.video &&
        this.video.readyState >= 2 &&
        !this.isProcessing &&
        this.worker &&
        this.isCameraReady
      ) {
        try {
          this.isProcessing = true;
          const timestamp = performance.now();

          // Render 480x270 frame to reduce tensor memory & latency
          if (this.offscreenCtx) {
            this.offscreenCtx.drawImage(this.video, 0, 0, 480, 270);
          }

          let bitmap: ImageBitmap;
          if ('transferToImageBitmap' in this.offscreenCanvas) {
            bitmap = (this.offscreenCanvas as OffscreenCanvas).transferToImageBitmap();
          } else {
            bitmap = await createImageBitmap(this.offscreenCanvas as HTMLCanvasElement);
          }

          this.worker.postMessage(
            {
              type: 'PROCESS_FRAME',
              bitmap,
              timestamp,
            },
            [bitmap]
          );
        } catch {
          this.isProcessing = false;
        }
      }

      requestAnimationFrame(process);
    };

    requestAnimationFrame(process);
  }

  private dispatchLandmarks(allHandsLandmarks: Array<Array<{ x: number; y: number }>>): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const packet: VisionPacket = {};

    if (this.gameMode === 'VERSUS') {
      let bestP1: HandPosition | null = null;
      let bestP2: HandPosition | null = null;

      for (const landmarks of allHandsLandmarks) {
        // Multi-landmark fallback: index tip (8) -> middle tip (12) -> knuckle (9) -> wrist (0)
        const pt = landmarks[8] || landmarks[12] || landmarks[9] || landmarks[0];
        if (!pt) continue;

        // Mirrored coordinate mapping (1 - x)
        const screenX = (1 - pt.x) * width;
        const screenY = pt.y * height;

        if (screenX < width / 2) {
          // Candidate for Player 1 (Left Half)
          if (!bestP1 || screenX < bestP1.x) {
            bestP1 = { x: screenX, y: screenY };
          }
        } else {
          // Candidate for Player 2 (Right Half)
          if (!bestP2 || screenX > bestP2.x) {
            bestP2 = { x: screenX, y: screenY };
          }
        }
      }

      if (bestP1) packet.p1Hand = bestP1;
      if (bestP2) packet.p2Hand = bestP2;
    } else {
      // SOLO MODE: Take first prominent hand
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
