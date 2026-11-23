/**
 * menus.js — title screen, pause menu, game-over and language select.
 * The title screen also shows the integration status strip (GitHub news,
 * Supabase leaderboard, Notion codex, Google Docs story, Linear quests).
 */
import { UI_THEME } from '../gfx/palette.js';
import { isRTL } from '../gfx/font.js';
import { clamp } from '../core/mathx.js';

export class TitleMenu {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.selected = 0;
    this.animTime = 0;
    this.duneOffset = 0;
    this.showCredits = false;
  }

  update(dt) {
    this.animTime += dt;
    this.duneOffset = (this.duneOffset + dt * 6) % 240;
    const input = this.ui.input;
    if (input.justPressed('moveDown') || input.justPressed('moveUp')) {
      const dir = input.justPressed('moveDown') ? 1 : -1;
      this.selected = (this.selected + dir + this.menuItems().length) % this.menuItems().length;
      input.endFrame();
    }
    if (input.justPressed('confirm') || input.justPressed('attack')) {
      const item = this.menuItems()[this.selected];
      if (item?.action) item.action();
    }
  }

  menuItems() {
    const g = this.game;
    const items = [
      { label: g.t('menu.newGame'), action: () => g.startNewGame() },
    ];
    if (g.hasSave()) {
      items.push({ label: g.t('menu.continue'), action: () => g.continueGame() });
    }
    items.push(
      { label: g.t('menu.settings'), action: () => g.openScreen('settings') },
      { label: g.t('menu.codex'), action: () => g.openScreen('codex') },
      { label: g.t('menu.credits'), action: () => { this.showCredits = !this.showCredits; } },
    );
    return items;
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    const ctx = ui.ctx;

    // --- animated dune background ---------------------------------
    const grad = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, vh) : null;
    if (grad) {
      grad.addColorStop(0, '#2a1b3a');
      grad.addColorStop(0.55, '#7a4e6e');
      grad.addColorStop(1, '#e8a45c');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#2a1b3a';
    }
    ctx.fillRect(0, 0, vw, vh);

    // sun
    const sunY = vh * 0.52 + Math.sin(this.animTime * 0.2) * 3;
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(vw / 2, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5d97c';
    ctx.beginPath();
    ctx.arc(vw / 2, sunY, 20, 0, Math.PI * 2);
    ctx.fill();

    // parallax dunes
    for (let layer = 0; layer < 3; layer += 1) {
      const speed = 2 + layer * 2.2;
      const baseY = vh * 0.62 + layer * 18;
      const amplitude = 10 - layer * 2;
      const color = ['#c98de0', '#b267aa', '#7c4a8a'][layer];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, vh);
      for (let x = 0; x <= vw; x += 8) {
        const y = baseY
          + Math.sin((x + this.duneOffset * speed) * 0.012) * amplitude
          + Math.sin((x + this.duneOffset * speed) * 0.03 + layer) * amplitude * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(vw, vh);
      ctx.closePath();
      ctx.fill();
    }

    // stars
    for (let i = 0; i < 24; i += 1) {
      const sx = (i * 97.3) % vw;
      const sy = (i * 53.7) % (vh * 0.5);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.animTime * 1.4 + i));
      ctx.globalAlpha = tw * 0.8;
      ctx.fillStyle = '#f5e9d0';
      ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.globalAlpha = 1;

    // --- title ------------------------------------------------------
    const title = g.t('game.title');
    const sub = g.t('game.subtitle');
    ui.text(title, vw / 2, vh * 0.14, {
      align: 'center',
      size: 18,
      color: UI_THEME.accent,
      bold: true,
    });
    ui.text(sub, vw / 2, vh * 0.14 + 22, {
      align: 'center',
      size: 8,
      color: UI_THEME.text,
    });

    // --- menu -------------------------------------------------------
    const items = this.menuItems();
    const startY = vh * 0.36;
    items.forEach((item, i) => {
      const y = startY + i * 18;
      const selected = i === this.selected;
      const w = 150;
      const x = (vw - w) / 2;
      if (selected) {
        ctx.fillStyle = 'rgba(232,182,76,0.22)';
        ctx.fillRect(x, y - 3, w, 16);
        ctx.fillStyle = UI_THEME.accent;
        ctx.fillRect(x, y - 3, 3, 16);
      }
      ui.text(item.label, vw / 2, y, {
        align: 'center',
        size: 9,
        color: selected ? UI_THEME.accent : UI_THEME.text,
        bold: selected,
      });
    });

    // --- integration status strip ------------------------------------
    this._renderIntegrations(vw, vh);

    // --- version / hint ----------------------------------------------
    ui.text('v1.0 · WASD + F/Esc · تم بالكامل بدون Vercel', vw / 2, vh - 12, {
      align: 'center',
      size: 6,
      color: UI_THEME.textDim,
    });

    if (this.showCredits) {
      this._renderCredits(vw, vh);
    }
  }

  _renderIntegrations(vw, vh) {
    const ui = this.ui;
    const g = this.game;
    const integrations = g.integrations?.statusList() ?? [];
    if (integrations.length === 0) return;
    const y = vh - 28;
    let x = 8;
    for (const it of integrations) {
      const label = `${it.icon} ${it.short}`;
      const w = ui.renderer.measureText(label, 6) + 12;
      const color = it.status === 'live' ? UI_THEME.good : it.status === 'snapshot' ? UI_THEME.accent : UI_THEME.textDim;
      ui.panel(x, y, w, 13, { alpha: 0.7, border: color });
      ui.text(label, x + 6, y + 3, { size: 6, color });
      x += w + 4;
      if (x > vw - 60) break;
    }
  }

  _renderCredits(vw, vh) {
    const ui = this.ui;
    ui.overlay(0.72);
    ui.panel(vw / 2 - 130, vh / 2 - 70, 260, 140, { title: 'Sands of Aether — رمال الأثير' });
    const lines = [
      'فكرة وتصميم: فريق Arena AI Agent',
      'محرك Canvas خفيف — بدون أي مكتبات خارجية',
      'مناسب للأجهزة الضعيفة · تحكم باللمس · عربي/English',
      '',
      'Integrations: Google Docs · Notion · Supabase',
      'GitHub · Linear  (No Vercel)',
    ];
    let y = vh / 2 - 42;
    for (const line of lines) {
      ui.text(line, vw / 2, y, {
        align: 'center',
        size: 7,
        color: UI_THEME.text,
      });
      y += 13;
    }
    ui.button(vw / 2 - 30, vh / 2 + 46, 60, 16, 'Close', {
      onClick: () => { this.showCredits = false; },
    });
  }
}

export class PauseMenu {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.selected = 0;
  }

  items() {
    const g = this.game;
    return [
      { label: g.t('menu.resume'), action: () => g.resume() },
      { label: g.t('menu.settings'), action: () => g.openScreen('settings') },
      { label: g.t('menu.save'), action: () => g.saveGame(true) },
      { label: g.t('menu.load'), action: () => g.loadGame() },
      { label: g.t('menu.title'), action: () => g.returnToTitle() },
    ];
  }

  update() {
    const input = this.ui.input;
    const items = this.items();
    if (input.justPressed('moveDown') || input.justPressed('moveUp')) {
      const dir = input.justPressed('moveDown') ? 1 : -1;
      this.selected = (this.selected + dir + items.length) % items.length;
    }
    if (input.justPressed('confirm') || input.justPressed('attack')) {
      items[this.selected]?.action();
    }
    if (input.justPressed('pause')) {
      this.game.resume();
    }
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    ui.overlay(0.6);
    ui.panel(vw / 2 - 80, vh / 2 - 72, 160, 150, { title: g.t('menu.paused') });
    const items = this.items();
    items.forEach((item, i) => {
      const y = vh / 2 - 44 + i * 20;
      const selected = i === this.selected;
      ui.button(vw / 2 - 62, y, 124, 16, item.label, {
        onClick: item.action,
        bg: selected ? UI_THEME.borderDark : undefined,
      });
    });
    ui.text('Esc / P — ' + g.t('menu.resume'), vw / 2, vh / 2 + 62, {
      align: 'center',
      size: 6,
      color: UI_THEME.textDim,
    });
  }
}

export class GameOverScreen {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.animTime = 0;
  }

  update(dt) {
    this.animTime += dt;
    const input = this.ui.input;
    if (input.justPressed('confirm')) this.game.respawnOrTitle();
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    ui.overlay(0.72);
    const alpha = clamp(this.animTime * 1.4, 0, 1);
    ui.ctx.globalAlpha = alpha;
    ui.text(g.t('game.over'), vw / 2, vh * 0.32, {
      align: 'center',
      size: 16,
      color: UI_THEME.danger,
      bold: true,
    });
    const stats = g.combat?.stats ?? {};
    ui.text(`Kills: ${stats.kills ?? 0}   Time: ${Math.floor((stats.runTime ?? 0) / 60)}m`, vw / 2, vh * 0.45, {
      align: 'center',
      size: 8,
      color: UI_THEME.text,
    });
    ui.button(vw / 2 - 70, vh * 0.58, 140, 18, g.t('game.respawn'), {
      onClick: () => g.respawnOrTitle(),
    });
    ui.ctx.globalAlpha = 1;
  }
}
