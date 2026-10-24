import { Application } from 'pixi.js';
import type { GameMode, GameStats } from './types/game';
import { GameEngine } from './engine/GameEngine';
import { visionService } from './services/VisionService';
import { sound } from './audio/SoundService';

let currentMode: GameMode = 'SOLO';

async function bootstrap() {
  const canvasElement = document.getElementById('game-canvas') as HTMLCanvasElement;
  const videoElement = document.getElementById('webcam-video') as HTMLVideoElement;
  const statusPill = document.getElementById('camera-status-pill') as HTMLDivElement;

  // Initialize PixiJS v8 with High-Performance WebGL configuration
  const app = new Application();
  await app.init({
    canvas: canvasElement,
    resizeTo: window,
    backgroundAlpha: 0,
    preference: 'webgl',
    antialias: false,
    resolution: 1, // Fixed 1:1 pixel grid, prevents rendering 4x/9x pixels on 2.5K/4K/Retina displays
    autoDensity: false,
    powerPreference: 'high-performance',
  });

  // Initialize Game Engine with reactive HUD callbacks
  const engine = new GameEngine(app, {
    onScoreUpdate: ({ solo, p1, p2, timeLeft }) => {
      updateHudUI(solo, p1, p2, timeLeft);
    },
    onGameOver: ({ mode, winnerTitle, solo, p1, p2 }) => {
      showGameOverModal(mode, winnerTitle, solo, p1, p2);
    },
  });

  // Start Vision Service (runs in Web Worker with zero main-thread contention)
  visionService.start(videoElement).then((success) => {
    if (!success) {
      if (statusPill) {
        statusPill.innerText = 'MODE SENTUH / MOUSE AKTIF';
        statusPill.style.color = '#f59e0b';
      }
    }
  });

  // Pipe Vision Worker landmarks to GameEngine
  visionService.onLandmarks(({ soloHand, p1Hand, p2Hand }) => {
    if (currentMode === 'VERSUS') {
      if (p1Hand) engine.inputPointer(p1Hand.x, p1Hand.y, 'P1');
      if (p2Hand) engine.inputPointer(p2Hand.x, p2Hand.y, 'P2');
    } else {
      if (soloHand) engine.inputPointer(soloHand.x, soloHand.y, 'SOLO');
    }
  });

  // Isolated Multi-touch & Mouse Fallback (Zero Cross-Finger Rope)
  const activeTouches = new Map<number, { x: number; y: number }>();

  window.addEventListener('mousedown', (e) => {
    sound.init();
    handleInput(e.clientX, e.clientY);
  });

  window.addEventListener('mousemove', (e) => {
    if (e.buttons === 1) {
      handleInput(e.clientX, e.clientY);
    }
  });

  window.addEventListener(
    'touchstart',
    (e) => {
      sound.init();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        handleInput(t.clientX, t.clientY);
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (activeTouches.has(t.identifier)) {
          handleInput(t.clientX, t.clientY);
          activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }
    },
    { passive: true }
  );

  window.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      activeTouches.delete(e.changedTouches[i].identifier);
    }
  });

  window.addEventListener('touchcancel', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      activeTouches.delete(e.changedTouches[i].identifier);
    }
  });

  function handleInput(clientX: number, clientY: number) {
    if (currentMode === 'VERSUS') {
      if (clientX < window.innerWidth / 2) {
        engine.inputPointer(clientX, clientY, 'P1');
      } else {
        engine.inputPointer(clientX, clientY, 'P2');
      }
    } else {
      engine.inputPointer(clientX, clientY, 'SOLO');
    }
  }

  // --- UI DOM Binding ---
  const tabSolo = document.getElementById('tab-solo') as HTMLButtonElement;
  const tabVersus = document.getElementById('tab-versus') as HTMLButtonElement;
  const btnStart = document.getElementById('btn-start-game') as HTMLButtonElement;
  const btnRestart = document.getElementById('btn-restart-game') as HTMLButtonElement;
  const btnSwitchMode = document.getElementById('btn-switch-mode-result') as HTMLButtonElement;

  const btnToggleSolo = document.getElementById('btn-toggle-mode-solo') as HTMLButtonElement;
  const btnToggleVs = document.getElementById('btn-toggle-mode-vs') as HTMLButtonElement;

  const startScreen = document.getElementById('start-screen') as HTMLDivElement;
  const gameoverScreen = document.getElementById('gameover-screen') as HTMLDivElement;

  const hudSolo = document.getElementById('hud-solo-group') as HTMLDivElement;
  const hudVersus = document.getElementById('hud-versus-group') as HTMLDivElement;

  function setMode(mode: GameMode) {
    currentMode = mode;
    visionService.gameMode = mode;
    engine.setMode(mode);

    if (mode === 'VERSUS') {
      tabSolo.className = 'mode-tab-btn';
      tabVersus.className = 'mode-tab-btn active versus';
      btnStart.className = 'btn-play versus';
      btnStart.innerHTML = `<span>Mulai 1 vs 1</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
    } else {
      tabSolo.className = 'mode-tab-btn active solo';
      tabVersus.className = 'mode-tab-btn';
      btnStart.className = 'btn-play';
      btnStart.innerHTML = `<span>Mulai Permainan</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
    }
  }

  tabSolo.addEventListener('click', () => setMode('SOLO'));
  tabVersus.addEventListener('click', () => setMode('VERSUS'));

  btnToggleSolo.addEventListener('click', () => {
    setMode('VERSUS');
    startGame();
  });

  btnToggleVs.addEventListener('click', () => {
    setMode('SOLO');
    startGame();
  });

  function startGame() {
    startScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');

    hudSolo.classList.toggle('hidden', currentMode === 'VERSUS');
    hudVersus.classList.toggle('hidden', currentMode !== 'VERSUS');

    engine.start(currentMode);
  }

  btnStart.addEventListener('click', startGame);
  btnRestart.addEventListener('click', startGame);

  btnSwitchMode.addEventListener('click', () => {
    setMode(currentMode === 'VERSUS' ? 'SOLO' : 'VERSUS');
    gameoverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  });

  // Audio Toggle
  document.getElementById('btn-audio')?.addEventListener('click', (e) => {
    const active = sound.toggle();
    (e.currentTarget as HTMLElement).classList.toggle('active', active);
  });

  // Camera Toggle
  document.getElementById('btn-camera')?.addEventListener('click', (e) => {
    const active = visionService.toggleCamera();
    (e.currentTarget as HTMLElement).classList.toggle('active', active);
    videoElement.style.display = active ? 'block' : 'none';
    if (statusPill) {
      statusPill.innerText = active ? 'GESTUR KAMERA AKTIF' : 'MODE SENTUH / MOUSE AKTIF';
      statusPill.style.color = active ? '#cbd5e1' : '#f59e0b';
    }
  });

  // Fullscreen Toggle
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  });
}

function updateHudUI(solo: GameStats, p1: GameStats, p2: GameStats, timeLeft: number) {
  if (currentMode === 'VERSUS') {
    const p1ScoreEl = document.getElementById('p1-score');
    const p1Co2El = document.getElementById('p1-co2');
    const p2ScoreEl = document.getElementById('p2-score');
    const p2Co2El = document.getElementById('p2-co2');
    const vsTimerEl = document.getElementById('vs-timer');

    if (p1ScoreEl) p1ScoreEl.innerText = p1.score.toLocaleString('id-ID');
    if (p1Co2El) p1Co2El.innerText = `${p1.co2.toFixed(1)} kg`;
    if (p2ScoreEl) p2ScoreEl.innerText = p2.score.toLocaleString('id-ID');
    if (p2Co2El) p2Co2El.innerText = `${p2.co2.toFixed(1)} kg`;

    if (vsTimerEl) {
      vsTimerEl.innerText = `${timeLeft}s`;
      vsTimerEl.classList.toggle('warning', timeLeft <= 10);
    }

    updateHearts('p1-lives-container', p1.lives);
    updateHearts('p2-lives-container', p2.lives);
  } else {
    const soloScoreEl = document.getElementById('solo-score');
    const soloCo2El = document.getElementById('solo-co2');
    const soloTimerEl = document.getElementById('solo-timer');

    if (soloScoreEl) soloScoreEl.innerText = solo.score.toLocaleString('id-ID');
    if (soloCo2El) soloCo2El.innerText = `${solo.co2.toFixed(1)} kg`;

    if (soloTimerEl) {
      soloTimerEl.innerText = `${timeLeft}s`;
      soloTimerEl.classList.toggle('warning', timeLeft <= 10);
    }

    updateHearts('solo-lives-container', solo.lives);
  }
}

function updateHearts(containerId: string, lives: number) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const hearts = container.querySelectorAll('.life-heart');
  hearts.forEach((h, idx) => {
    h.classList.toggle('lost', idx >= lives);
  });
}

function showGameOverModal(
  mode: GameMode,
  winnerTitle: string,
  solo: GameStats,
  p1: GameStats,
  p2: GameStats
) {
  const gameoverScreen = document.getElementById('gameover-screen');
  const resultTitle = document.getElementById('result-title');
  const resultBadge = document.getElementById('result-badge');

  const soloContainer = document.getElementById('result-solo-container');
  const versusContainer = document.getElementById('result-versus-container');

  if (resultTitle) resultTitle.innerText = winnerTitle;

  if (mode === 'VERSUS') {
    if (resultBadge) resultBadge.innerText = 'HASIL 1 VS 1 TANDING';
    soloContainer?.classList.add('hidden');
    versusContainer?.classList.remove('hidden');

    const p1Score = document.getElementById('vs-res-p1-score');
    const p2Score = document.getElementById('vs-res-p2-score');
    const p1Co2 = document.getElementById('vs-res-p1-co2');
    const p2Co2 = document.getElementById('vs-res-p2-co2');
    const p1Combo = document.getElementById('vs-res-p1-combo');
    const p2Combo = document.getElementById('vs-res-p2-combo');
    const p1Status = document.getElementById('vs-res-p1-status');
    const p2Status = document.getElementById('vs-res-p2-status');

    if (p1Score) p1Score.innerText = p1.score.toLocaleString('id-ID');
    if (p2Score) p2Score.innerText = p2.score.toLocaleString('id-ID');
    if (p1Co2) p1Co2.innerText = `${p1.co2.toFixed(1)} kg`;
    if (p2Co2) p2Co2.innerText = `${p2.co2.toFixed(1)} kg`;
    if (p1Combo) p1Combo.innerText = `${p1.maxCombo}x`;
    if (p2Combo) p2Combo.innerText = `${p2.maxCombo}x`;
    if (p1Status) p1Status.innerText = p1.lives > 0 ? 'BERTAHAN' : 'TERELIMINASI';
    if (p2Status) p2Status.innerText = p2.lives > 0 ? 'BERTAHAN' : 'TERELIMINASI';
  } else {
    if (resultBadge) resultBadge.innerText = 'HASIL PERTANDINGAN';
    soloContainer?.classList.remove('hidden');
    versusContainer?.classList.add('hidden');

    const resScore = document.getElementById('res-score');
    const resCo2 = document.getElementById('res-co2');
    const resCombo = document.getElementById('res-combo');
    const resGrade = document.getElementById('result-grade');

    if (resScore) resScore.innerText = solo.score.toLocaleString('id-ID');
    if (resCo2) resCo2.innerText = `${solo.co2.toFixed(1)} kg`;
    if (resCombo) resCombo.innerText = `${solo.maxCombo}x`;

    let grade = 'C';
    if (solo.score >= 2500) grade = 'S+';
    else if (solo.score >= 1800) grade = 'A';
    else if (solo.score >= 1000) grade = 'B';

    if (resGrade) resGrade.innerText = grade;
  }

  gameoverScreen?.classList.remove('hidden');
}

window.addEventListener('load', () => {
  void bootstrap();
});
