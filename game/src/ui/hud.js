/**
 * hud.js — in-game heads-up display: health/mana/xp bars, skill hotbar,
 * minimap, quest tracker, weather/clock badges and boss bar.
 */
import { UI_THEME, RARITY } from '../gfx/palette.js';
import { formatGold, formatTime } from '../gfx/font.js';
import { clamp } from '../core/mathx.js';

export class HUD {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.bossBarAlpha = 0;
    this.levelBanner = null; // { text, sub, life }
    this.damageFlash = 0;
  }

  showBanner(text, sub = '', life = 2.6) {
    this.levelBanner = { text, sub, life, maxLife: life };
  }

  update(dt) {
    if (this.levelBanner) {
      this.levelBanner.life -= dt;
      if (this.levelBanner.life <= 0) this.levelBanner = null;
    }
    const boss = this.game.world?.boss;
    const target = boss && boss.alive ? 1 : 0;
    this.bossBarAlpha += (target - this.bossBarAlpha) * Math.min(1, dt * 5);
    if (this.damageFlash > 0) this.damageFlash -= dt;
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const player = g.player;
    if (!player) return;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;

    // --- top-left: health / mana / xp ---------------------------------
    const pad = 8;
    ui.panel(pad, pad, 116, 44, { alpha: 0.82, id: 'hudStats' });
    ui.bar(pad + 6, pad + 6, 104, 8, player.hp / player.stats.maxHp, {
      fill: UI_THEME.hp,
      label: `${Math.ceil(player.hp)}/${player.stats.maxHp}`,
      labelSize: 6,
    });
    ui.bar(pad + 6, pad + 17, 104, 6, player.mana / Math.max(1, player.stats.maxMana), {
      fill: UI_THEME.mana,
      back: '#1c2c4a',
    });
    ui.bar(pad + 6, pad + 26, 104, 5, player.xp / player.xpNext, {
      fill: UI_THEME.xp,
      back: UI_THEME.xpBack,
    });
    ui.text(`Lv ${player.level}`, pad + 110, pad + 34, { align: 'right', size: 7, color: UI_THEME.accent });

    // --- top-right: gold, clock, weather ------------------------------
    const gold = formatGold(player.gold);
    const rightX = vw - pad;
    ui.panel(rightX - 118, pad, 118, 34, { alpha: 0.82, id: 'hudMeta' });
    ui.text(`${gold} 🪙`, rightX - 10, pad + 6, { align: 'right', size: 8, color: UI_THEME.gold });
    const world = g.world;
    if (world?.dayNight) {
      ui.text(`${world.dayNight.clockText} · ${world.dayNight.phase === 'night' ? '🌙' : '☀'}`, rightX - 10, pad + 19, {
        align: 'right',
        size: 7,
        color: UI_THEME.textDim,
      });
    }
    if (world?.weather) {
      const wDef = world.weather.def;
      const wName = wDef.name?.[g.lang] ?? wDef.name?.en ?? '';
      if (wName) {
        ui.text(wName, rightX - 10, pad + 27, { align: 'right', size: 6, color: UI_THEME.accentAlt });
      }
    }

    // --- bottom: skill hotbar ----------------------------------------
    const skills = g.skills;
    if (skills) {
      const slotSize = 22;
      const gap = 4;
      const count = 4;
      const totalW = count * slotSize + (count - 1) * gap;
      let sx = (vw - totalW) / 2;
      const sy = vh - slotSize - 8;
      for (let i = 0; i < count; i += 1) {
        const skillId = skills.equipped[i];
        const def = skillId ? skills.skillDb[skillId] : null;
        const cd = skillId ? skills.cooldownOf(skillId) : 0;
        ui.iconSlot(sx, sy, null, {
          size: slotSize,
          bg: def ? UI_THEME.panelLight : 'rgba(20,14,28,0.6)',
          border: UI_THEME.borderDark,
        });
        if (def) {
          ui.text(def.glyph ?? '?', sx + slotSize / 2, sy + slotSize / 2 - 5, {
            align: 'center',
            size: 9,
            color: UI_THEME.accent,
          });
          if (cd > 0) {
            const ratio = cd / Math.max(0.01, skills.effectiveCooldown(skillId));
            const ctx = ui.ctx;
            ctx.fillStyle = 'rgba(10,6,16,0.7)';
            ctx.fillRect(sx, sy, slotSize, Math.round(slotSize * ratio));
            ui.text(cd.toFixed(1), sx + slotSize / 2, sy + slotSize / 2 - 3, {
              align: 'center',
              size: 6,
              color: '#fff',
            });
          }
          const cost = skills.manaCost(skillId);
          ui.text(String(Math.round(cost)), sx + slotSize - 2, sy + slotSize - 8, {
            align: 'right',
            size: 5,
            color: player.mana >= cost ? UI_THEME.mana : UI_THEME.danger,
          });
        }
        ui.text(String(i + 1), sx + 2, sy + 2, { size: 5, color: UI_THEME.textDim });
        sx += slotSize + gap;
      }
      // stamina strip under the hotbar
      ui.bar((vw - 90) / 2, sy + slotSize + 2, 90, 3, player.stamina / Math.max(1, player.stats.stamina), {
        fill: UI_THEME.good,
        back: '#1c3a20',
        border: false,
      });
    }

    // --- minimap (top-right under meta panel) -------------------------
    const mm = g.world?.minimap;
    if (mm) {
      const size = 74;
      mm.detail = g.performance?.profile?.minimapDetail ?? true;
      mm.render(ui.ctx, vw - size - pad, pad + 38, size, size, g.world.entities ?? [], player);
    }

    // --- quest tracker (left, below stats) ----------------------------
    const quests = g.quests?.activeQuests() ?? [];
    if (quests.length > 0) {
      const qy = pad + 50;
      ui.panel(pad, qy, 116, 18 + Math.min(2, quests.length) * 22, { alpha: 0.72, id: 'hudQuests' });
      ui.text('QUESTS', pad + 6, qy + 5, { size: 6, color: UI_THEME.accent });
      let cy = qy + 15;
      for (const q of quests.slice(0, 2)) {
        const def = q.def;
        const title = def?.title?.[g.lang] ?? def?.title?.en ?? q.id;
        ui.text(title, pad + 6, cy, { size: 6, color: UI_THEME.text });
        const obj = def?.objectives?.[0];
        if (obj) {
          const progress = q.progress?.[0] ?? 0;
          ui.text(`${progress}/${obj.count ?? 1}`, pad + 110, cy, {
            size: 6,
            align: 'right',
            color: progress >= (obj.count ?? 1) ? UI_THEME.good : UI_THEME.textDim,
          });
        }
        cy += 11;
      }
    }

    // --- boss bar -----------------------------------------------------
    const boss = g.world?.boss;
    if (boss && (boss.alive || this.bossBarAlpha > 0.02)) {
      const w = Math.min(300, vw - 60);
      const x = (vw - w) / 2;
      const y = 12;
      const ctx = ui.ctx;
      ctx.globalAlpha = clamp(this.bossBarAlpha, 0, 1);
      ui.panel(x - 4, y - 4, w + 8, 26, { alpha: 0.85 });
      const name = boss.name?.[g.lang] ?? boss.name?.en ?? 'Boss';
      ui.text(name, vw / 2, y - 1, { align: 'center', size: 7, color: UI_THEME.danger, bold: true });
      ui.bar(x, y + 10, w, 8, boss.hp / Math.max(1, boss.maxHp), {
        fill: '#c23c30',
        back: '#3a1414',
      });
      ctx.globalAlpha = 1;
    }

    // --- level banner -------------------------------------------------
    if (this.levelBanner) {
      const b = this.levelBanner;
      const k = b.life / b.maxLife;
      const alpha = clamp(k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1, 0, 1);
      const ctx = ui.ctx;
      ctx.globalAlpha = alpha;
      ui.text(b.text, vw / 2, vh * 0.3, {
        align: 'center',
        size: 14,
        color: UI_THEME.accent,
        bold: true,
      });
      if (b.sub) {
        ui.text(b.sub, vw / 2, vh * 0.3 + 20, {
          align: 'center',
          size: 8,
          color: UI_THEME.text,
        });
      }
      ctx.globalAlpha = 1;
    }

    // --- interaction hint ---------------------------------------------
    const target = g.world?.interactionTarget;
    if (target) {
      const hint = target.hint ?? (target.kind === 'npc' ? 'Talk (F)' : target.kind === 'chest' ? 'Open (F)' : 'Use (F)');
      ui.panel(vw / 2 - 60, vh - 62, 120, 16, { alpha: 0.85 });
      ui.text(hint, vw / 2, vh - 58, { align: 'center', size: 7, color: UI_THEME.accent });
    }

    // --- combo counter --------------------------------------------------
    if (g.combat && g.combat.comboCount > 1) {
      ui.text(`${g.combat.comboCount}× combo`, vw / 2, vh - 82, {
        align: 'center',
        size: 9,
        color: UI_THEME.gold,
        bold: true,
      });
    }

    // --- run time -------------------------------------------------------
    if (g.stats?.runTime !== undefined) {
      ui.text(formatTime(g.stats.runTime), pad + 2, vh - 14, {
        size: 6,
        color: UI_THEME.textDim,
      });
    }

    // --- damage vignette -------------------------------------------------
    if (this.damageFlash > 0) {
      const ctx = ui.ctx;
      ctx.globalAlpha = clamp(this.damageFlash * 1.6, 0, 0.45);
      ctx.fillStyle = '#c23c30';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
  }

  onPlayerHit() {
    this.damageFlash = 0.35;
  }
}

export { RARITY };
