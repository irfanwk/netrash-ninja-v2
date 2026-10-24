import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let handLandmarker: HandLandmarker | null = null;
let isInitializing = false;

async function initLandmarker() {
  if (handLandmarker || isInitializing) return;
  isInitializing = true;

  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.35,
      minHandPresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
    });

    self.postMessage({ type: 'READY' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'ERROR', error: msg });
  } finally {
    isInitializing = false;
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type, bitmap, timestamp } = e.data;

  if (type === 'INIT') {
    await initLandmarker();
    return;
  }

  if (type === 'PROCESS_FRAME') {
    if (!handLandmarker) {
      if (bitmap) bitmap.close();
      return;
    }

    try {
      const results = handLandmarker.detectForVideo(bitmap, timestamp);
      bitmap.close();

      self.postMessage({
        type: 'LANDMARKS',
        landmarks: results.landmarks,
        handednesses: results.handedness,
        timestamp,
      });
    } catch {
      if (bitmap) bitmap.close();
    }
  }
};
