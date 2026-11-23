/**
 * main.js — browser entry point: DOM wiring, resize handling, boot sequence.
 * Everything else lives in modules; this file is intentionally thin.
 */
import { Game } from './game/game.js';
import { INTEGRATION_CONFIG } from './data/integrationConfig.js';

function boot() {
  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading');
  if (!canvas) {
    console.error('[main] #game-canvas not found');
    return;
  }

  const game = new Game({ canvas, config: INTEGRATION_CONFIG });

  // fit the canvas to the window (letterboxed, keeps 16:9)
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w / 480, h / 270);
    const cssW = Math.floor(480 * scale);
    const cssH = Math.floor(270 * scale);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.style.left = `${Math.floor((w - cssW) / 2)}px`;
    canvas.style.top = `${Math.floor((h - cssH) / 2)}px`;
    game.renderer.resize(cssW, cssH);
  }
  window.addEventListener('resize', resize);
  resize();

  // language from browser or saved setting
  const saved = localStorage.getItem('sands-of-aether:settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const lang = parsed?.d?.language;
      if (lang) game.setLanguage(lang);
    } catch (err) {
      /* ignore */
    }
  } else if ((navigator.language ?? '').startsWith('ar')) {
    game.setLanguage('ar');
  } else {
    game.setLanguage('en');
  }

  // hide the loading overlay once the first frame lands
  requestAnimationFrame(() => {
    game.boot();
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => loading.remove(), 400);
    }
  });

  // expose for debugging (harmless in production)
  window.SANDS = game;

  // autosave every 90s while playing
  setInterval(() => {
    if (game.scene === 'playing') game.saveGame(false);
  }, 90000);

  // warn before closing mid-run
  window.addEventListener('beforeunload', (e) => {
    if (game.scene === 'playing' && game.player) {
      game.saveGame(false);
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

export { boot };
