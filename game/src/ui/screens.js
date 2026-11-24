/**
 * screens.js — full-screen UI states: inventory, map, quests, codex,
 * settings and the leaderboard. One module keeps the shared chrome and
 * navigation consistent across screens.
 */
import { UI_THEME, RARITY } from '../gfx/palette.js';
import { formatGold, formatStat, isRTL } from '../gfx/font.js';
import { clamp } from '../core/mathx.js';

export class ScreenManager {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.current = null; // 'inventory' | 'map' | 'quests' | 'codex' | 'settings' | 'leaderboard' | 'shop'
    this.screens = {
      inventory: new InventoryScreen(ui, game),
      map: new MapScreen(ui, game),
      quests: new QuestScreen(ui, game),
      codex: new CodexScreen(ui, game),
      settings: new SettingsScreen(ui, game),
      leaderboard: new LeaderboardScreen(ui, game),
      shop: new ShopScreen(ui, game),
    };
    this.tabAnim = 0;
  }

  open(name) {
    if (!this.screens[name]) return false;
    this.current = name;
    this.screens[name].onOpen?.();
    return true;
  }

  close() {
    if (this.current) this.screens[this.current].onClose?.();
    this.current = null;
  }

  isOpen() {
    return this.current !== null;
  }

  toggle(name) {
    if (this.current === name) this.close();
    else this.open(name);
  }

  update(dt) {
    if (!this.current) return;
    const screen = this.screens[this.current];
    screen.update(dt);
    const input = this.ui.input;
    if (input.justPressed('cancel') || input.justPressed('pause')) {
      if (screen.canClose !== false) this.close();
    }
    // quick tab switching
    const tabKeys = { inventory: 'inventory', map: 'map', quests: 'quests', codex: 'codex', settings: 'settings' };
    for (const [name, action] of Object.entries(tabKeys)) {
      if (input.justPressed(action) && this.screens[name]) {
        if (this.current !== name) this.open(name);
      }
    }
  }

  render() {
    if (!this.current) return;
    this.ui.overlay(0.55);
    this.screens[this.current].render();
  }
}

// ------------------------------------------------------------- inventory

export class InventoryScreen {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.selected = 0;
    this.tab = 'bag'; // bag | equip | craft
  }

  onOpen() {
    this.selected = 0;
  }

  update(dt) {
    void dt;
    const input = this.ui.input;
    const items = this._items();
    if (input.justPressed('moveDown')) this.selected = Math.min(items.length - 1, this.selected + 1);
    if (input.justPressed('moveUp')) this.selected = Math.max(0, this.selected - 1);
    if (input.justPressed('confirm') || input.justPressed('interact')) {
      this._useSelected();
    }
    if (input.justPressed('dash')) {
      this.tab = this.tab === 'bag' ? 'equip' : this.tab === 'equip' ? 'craft' : 'bag';
    }
  }

  _items() {
    const g = this.game;
    if (this.tab === 'craft') return g.crafting?.listRecipes() ?? [];
    return g.inventory?.stacks ?? [];
  }

  _useSelected() {
    const g = this.game;
    const items = this._items();
    const item = items[this.selected];
    if (!item) return;
    if (this.tab === 'craft') {
      const res = g.crafting.craft(item.id, g.inventory, g.player);
      if (res.ok) {
        g.audio?.play('craft');
        g.ui.toast(g.t('toast.crafted'), { color: UI_THEME.good });
      } else {
        g.audio?.play('error');
      }
      return;
    }
    const def = g.inventory.getItemDef(item.itemId);
    if (!def) return;
    if (['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'].includes(def.type)) {
      g.inventory.equip(item.itemId);
      g.player.recalcStats(g.inventory.equipmentBonuses());
      g.audio?.play('uiConfirm');
    } else if (def.type === 'consumable') {
      g.applyConsumable(def);
      g.audio?.play('pickup');
    }
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    const x = vw / 2 - 150;
    const y = vh / 2 - 95;
    ui.panel(x, y, 300, 190, { title: g.t('screen.inventory') });

    // tabs
    const tabs = [
      ['bag', g.t('inv.bag')],
      ['equip', g.t('inv.equip')],
      ['craft', g.t('inv.craft')],
    ];
    tabs.forEach(([id, label], i) => {
      const tx = x + 10 + i * 80;
      ui.button(tx, y + 22, 74, 14, label, {
        onClick: () => { this.tab = id; this.selected = 0; },
        bg: this.tab === id ? UI_THEME.borderDark : undefined,
      });
    });

    const items = this._items();
    const listX = x + 10;
    const listY = y + 42;
    const clicked = ui.list(listX, listY, 170, 138, items, {
      id: `inv-${this.tab}`,
      selectedIndex: this.selected,
      rowH: 20,
      renderRow: (item, ix, iy, iw, ih, meta) => {
        if (this.tab === 'craft') {
          ui.text(item.name?.[g.lang] ?? item.id, ix + 4, iy + 6, {
            size: 6,
            color: meta.selected ? UI_THEME.accent : UI_THEME.text,
          });
          ui.text(`${item.inputs?.length ?? 0}⚙`, ix + iw - 6, iy + 6, { size: 6, align: 'right', color: UI_THEME.textDim });
        } else {
          const def = g.inventory.getItemDef(item.itemId) ?? {};
          const rarity = RARITY[def.rarity ?? 'common'];
          ui.iconSlot(ix + 2, iy - 1, g.sprites?.icon(def.icon ?? 'material', def.iconColors), {
            size: ih - 2,
            rarityColor: rarity?.color,
          });
          const name = def.name?.[g.lang] ?? item.itemId;
          ui.text(name, ix + ih + 2, iy + 6, {
            size: 6,
            color: meta.selected ? UI_THEME.accent : rarity?.color ?? UI_THEME.text,
          });
          if (item.count > 1) {
            ui.text(`×${item.count}`, ix + iw - 6, iy + 6, { size: 6, align: 'right', color: UI_THEME.textDim });
          }
        }
      },
    });
    if (clicked >= 0) this.selected = clicked;

    // detail pane
    const detailX = x + 188;
    ui.panel(detailX, listY, 102, 138, { alpha: 0.85 });
    const item = items[this.selected];
    if (item) {
      if (this.tab === 'craft') {
        const def = g.crafting.getRecipe(item.id);
        ui.text(def?.name?.[g.lang] ?? def?.id ?? '', detailX + 6, listY + 6, { size: 7, color: UI_THEME.accent });
        let cy = listY + 20;
        for (const input of def?.inputs ?? []) {
          const idef = g.inventory.getItemDef(input.itemId) ?? {};
          const have = g.inventory.countOf(input.itemId);
          const need = input.count ?? 1;
          ui.text(`${idef.name?.[g.lang] ?? input.itemId}`, detailX + 6, cy, { size: 6 });
          ui.text(`${have}/${need}`, detailX + 96, cy, {
            size: 6,
            align: 'right',
            color: have >= need ? UI_THEME.good : UI_THEME.danger,
          });
          cy += 10;
        }
        ui.button(detailX + 8, listY + 116, 86, 16, g.t('inv.craft'), {
          onClick: () => this._useSelected(),
        });
      } else {
        const def = g.inventory.getItemDef(item.itemId) ?? {};
        ui.text(def.name?.[g.lang] ?? item.itemId, detailX + 6, listY + 6, { size: 7, color: UI_THEME.accent });
        const desc = def.desc?.[g.lang] ?? def.desc?.en ?? '';
        ui.paragraph(desc, detailX + 6, listY + 18, 90, { size: 5, lineHeight: 2 });
        let cy = listY + 76;
        for (const [stat, value] of Object.entries(def.stats ?? {})) {
          ui.text(formatStat(value, ` ${stat}`), detailX + 6, cy, {
            size: 6,
            color: value >= 0 ? UI_THEME.good : UI_THEME.danger,
          });
          cy += 9;
        }
        ui.text(formatGold(def.price ?? 0) + 'g', detailX + 6, listY + 122, { size: 6, color: UI_THEME.gold });
      }
    }

    ui.text(`[1] ${g.t('inv.use')}  [Tab] ${g.t('inv.switch')}  [Esc] ${g.t('menu.close')}`, x + 150, y + 182, {
      align: 'center',
      size: 6,
      color: UI_THEME.textDim,
    });
    void isRTL;
    void clamp;
  }
}

// ------------------------------------------------------------------ map

export class MapScreen {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.zoom = 1;
  }

  update(dt) {
    void dt;
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    const x = vw / 2 - 160;
    const y = vh / 2 - 105;
    ui.panel(x, y, 320, 210, { title: g.t('screen.map') });
    const mm = g.world?.minimap;
    if (mm && mm.canvas) {
      const scale = Math.min(296 / mm.width, 168 / mm.height) * this.zoom;
      const dw = mm.width * scale;
      const dh = mm.height * scale;
      ui.ctx.drawImage(mm.canvas, x + 12 + (296 - dw) / 2, y + 26 + (168 - dh) / 2, dw, dh);
      const explored = Math.round(mm.exploredRatio() * 100);
      ui.text(`${g.t('map.explored')}: ${explored}%`, x + 160, y + 198, {
        align: 'center',
        size: 7,
        color: UI_THEME.accent,
      });
    } else {
      ui.text(g.t('map.unavailable'), x + 160, y + 100, { align: 'center', size: 8, color: UI_THEME.textDim });
    }
  }
}

// ---------------------------------------------------------------- quests

export class QuestScreen {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.selected = 0;
  }

  update() {
    const input = this.ui.input;
    const quests = this.game.quests?.activeQuests() ?? [];
    if (input.justPressed('moveDown')) this.selected = Math.min(quests.length - 1, this.selected + 1);
    if (input.justPressed('moveUp')) this.selected = Math.max(0, this.selected - 1);
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    const x = vw / 2 - 150;
    const y = vh / 2 - 95;
    ui.panel(x, y, 300, 190, { title: g.t('screen.quests') });
    const quests = g.quests?.activeQuests() ?? [];
    const completed = g.quests?.completedCount() ?? 0;
    ui.text(`${g.t('quests.completed')}: ${completed}`, x + 290, y + 6, {
      align: 'right',
      size: 6,
      color: UI_THEME.good,
    });
    const clicked = ui.list(x + 10, y + 26, 140, 154, quests, {
      id: 'questList',
      selectedIndex: this.selected,
      rowH: 22,
      renderRow: (q, ix, iy, iw, ih, meta) => {
        const def = q.def ?? {};
        ui.text(def.title?.[g.lang] ?? q.id, ix + 4, iy + 4, {
          size: 6,
          color: q.state === 'ready' ? UI_THEME.good : meta.selected ? UI_THEME.accent : UI_THEME.text,
        });
        if (q.state === 'ready') ui.text('✔', ix + iw - 12, iy + 4, { size: 7, color: UI_THEME.good });
      },
    });
    if (clicked >= 0) this.selected = clicked;
    const q = quests[this.selected];
    ui.panel(x + 158, y + 26, 132, 154, { alpha: 0.85 });
    if (q?.def) {
      const def = q.def;
      ui.text(def.title?.[g.lang] ?? q.id, x + 164, y + 32, { size: 7, color: UI_THEME.accent });
      ui.paragraph(def.desc?.[g.lang] ?? def.desc?.en ?? '', x + 164, y + 46, 120, { size: 5, lineHeight: 3 });
      let cy = y + 110;
      (def.objectives ?? []).forEach((obj, i) => {
        const progress = q.progress?.[i] ?? 0;
        const done = progress >= (obj.count ?? 1);
        ui.text(`${done ? '✔' : '•'} ${obj.label?.[g.lang] ?? obj.type}`, x + 164, cy, {
          size: 5,
          color: done ? UI_THEME.good : UI_THEME.text,
        });
        ui.text(`${progress}/${obj.count ?? 1}`, x + 284, cy, {
          size: 5,
          align: 'right',
          color: done ? UI_THEME.good : UI_THEME.textDim,
        });
        cy += 9;
      });
      if (q.state === 'ready') {
        ui.button(x + 170, y + 160, 108, 16, g.t('quests.turnIn'), {
          onClick: () => {
            g.turnInQuest(q.id);
          },
        });
      }
    } else {
      ui.text(g.t('quests.none'), x + 224, y + 100, { align: 'center', size: 7, color: UI_THEME.textDim });
    }
  }
}

// ----------------------------------------------------------------- codex

export class CodexScreen {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.section = 'lore';
    this.selected = 0;
  }

  update() {
    void 0;
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    const x = vw / 2 - 160;
    const y = vh / 2 - 105;
    ui.panel(x, y, 320, 210, { title: g.t('screen.codex') });
    const sections = [
      ['lore', g.t('codex.lore'), () => g.content?.loreEntries?.() ?? []],
      ['bestiary', g.t('codex.bestiary'), () => g.content?.bestiaryEntries?.() ?? []],
      ['integrations', g.t('codex.integrations'), () => g.integrations?.statusList() ?? []],
    ];
    sections.forEach(([id, label], i) => {
      ui.button(x + 10 + i * 100, y + 22, 94, 14, label, {
        onClick: () => { this.section = id; this.selected = 0; },
        bg: this.section === id ? UI_THEME.borderDark : undefined,
      });
    });

    const entry = sections.find(([id]) => id === this.section);
    const items = entry ? entry[2]() : [];
    const clicked = ui.list(x + 10, y + 42, 140, 156, items.map((it) => ({
      label: it.name?.[g.lang] ?? it.name?.en ?? it.short ?? it.id,
      tooltip: null,
    })), {
      id: `codex-${this.section}`,
      selectedIndex: this.selected,
      rowH: 18,
    });
    if (clicked >= 0) this.selected = clicked;

    ui.panel(x + 158, y + 42, 152, 156, { alpha: 0.85 });
    const sel = items[this.selected];
    if (sel) {
      const title = sel.name?.[g.lang] ?? sel.name?.en ?? sel.short ?? sel.id;
      ui.text(title, x + 164, y + 50, { size: 7, color: UI_THEME.accent });
      const body = sel.desc?.[g.lang] ?? sel.desc?.en ?? sel.detail ?? sel.status ?? '';
      ui.paragraph(String(body), x + 164, y + 64, 140, { size: 5, lineHeight: 3 });
      if (sel.link) {
        ui.text(sel.link, x + 164, y + 184, { size: 5, color: UI_THEME.accentAlt });
      }
    }
  }
}

// -------------------------------------------------------------- settings

export class SettingsScreen {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
  }

  update() {
    void 0;
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    const x = vw / 2 - 130;
    const y = vh / 2 - 100;
    ui.panel(x, y, 260, 200, { title: g.t('screen.settings') });

    let cy = y + 28;
    ui.text(g.t('settings.language'), x + 12, cy, { size: 7 });
    ui.button(x + 120, cy - 4, 50, 14, 'العربية', {
      onClick: () => g.setLanguage('ar'),
      bg: g.lang === 'ar' ? UI_THEME.borderDark : undefined,
    });
    ui.button(x + 176, cy - 4, 50, 14, 'English', {
      onClick: () => g.setLanguage('en'),
      bg: g.lang === 'en' ? UI_THEME.borderDark : undefined,
    });
    cy += 24;

    ui.text(g.t('settings.quality'), x + 12, cy, { size: 7 });
    ['low', 'medium', 'high'].forEach((q, i) => {
      const tier = i;
      ui.button(x + 120 + i * 42, cy - 4, 38, 14, q, {
        onClick: () => g.setQuality(tier),
        bg: g.performance?.tier === tier ? UI_THEME.borderDark : undefined,
      });
    });
    cy += 24;

    // renderer mode: 3D world / classic 2D (applies after reload)
    const mode = g.settings?.renderer ?? 'auto';
    ui.text(g.t('settings.renderer'), x + 12, cy, { size: 7 });
    ['auto', '3d', '2d'].forEach((m, i) => {
      ui.button(x + 120 + i * 42, cy - 4, 38, 14, m, {
        onClick: () => {
          g.setSetting('renderer', m);
          ui.toast(g.t('settings.rendererApply'), { color: '#e8b64c' });
        },
        bg: mode === m ? UI_THEME.borderDark : undefined,
      });
    });
    cy += 24;

    ui.text(g.t('settings.music'), x + 12, cy, { size: 7 });
    ui.bar(x + 120, cy, 104, 8, g.settings?.musicVolume ?? 0.45, {
      fill: UI_THEME.accent,
      back: UI_THEME.xpBack,
      label: `${Math.round((g.settings?.musicVolume ?? 0.45) * 100)}%`,
      labelSize: 5,
    });
    cy += 18;
    ui.text(g.t('settings.sfx'), x + 12, cy, { size: 7 });
    ui.bar(x + 120, cy, 104, 8, g.settings?.sfxVolume ?? 0.8, {
      fill: UI_THEME.accentAlt,
      back: UI_THEME.xpBack,
      label: `${Math.round((g.settings?.sfxVolume ?? 0.8) * 100)}%`,
      labelSize: 5,
    });
    cy += 22;

    const touchOn = g.settings?.touchControls ?? true;
    if (ui.checkbox(x + 12, cy, touchOn, g.t('settings.touch'), {})) {
      g.setSetting('touchControls', !touchOn);
    }
    cy += 18;
    const shakeOn = g.settings?.screenShake ?? true;
    if (ui.checkbox(x + 12, cy, shakeOn, g.t('settings.shake'), {})) {
      g.setSetting('screenShake', !shakeOn);
    }
    cy += 26;

    ui.button(x + 12, cy, 110, 16, g.t('settings.cloudSync'), {
      onClick: () => g.integrations?.syncNow(),
    });
    ui.button(x + 130, cy, 110, 16, g.t('menu.close'), {
      onClick: () => g.closeScreen(),
    });
  }
}

// ------------------------------------------------------------ leaderboard

export class LeaderboardScreen {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.entries = [];
    this.status = 'idle';
  }

  onOpen() {
    this.status = 'loading';
    this.game.integrations?.fetchLeaderboard().then((entries) => {
      this.entries = entries ?? [];
      this.status = entries ? 'ready' : 'offline';
    }).catch(() => {
      this.status = 'offline';
    });
  }

  update() {
    void 0;
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    const x = vw / 2 - 130;
    const y = vh / 2 - 100;
    ui.panel(x, y, 260, 200, { title: g.t('screen.leaderboard') });
    if (this.status === 'loading') {
      ui.text('…', x + 130, y + 100, { align: 'center', size: 10, color: UI_THEME.textDim });
    } else if (this.entries.length === 0) {
      ui.text(g.t('leaderboard.empty'), x + 130, y + 90, { align: 'center', size: 7, color: UI_THEME.textDim });
      ui.text(g.t('leaderboard.hint'), x + 130, y + 104, { align: 'center', size: 6, color: UI_THEME.textDim });
    } else {
      this.entries.slice(0, 10).forEach((entry, i) => {
        const ey = y + 30 + i * 16;
        ui.text(`#${i + 1}`, x + 14, ey, { size: 7, color: i < 3 ? UI_THEME.gold : UI_THEME.textDim });
        ui.text(String(entry.name ?? '—').slice(0, 16), x + 44, ey, { size: 7, color: UI_THEME.text });
        ui.text(String(entry.score ?? 0), x + 244, ey, { align: 'right', size: 7, color: UI_THEME.accent });
      });
    }
    ui.button(x + 90, y + 176, 80, 16, g.t('menu.close'), {
      onClick: () => g.closeScreen(),
    });
  }
}

// ------------------------------------------------------------------ shop

export class ShopScreen {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.selected = 0;
    this.mode = 'buy';
    this.canClose = true;
  }

  onOpen() {
    this.selected = 0;
  }

  update() {
    const input = this.ui.input;
    const items = this._items();
    if (input.justPressed('moveDown')) this.selected = Math.min(items.length - 1, this.selected + 1);
    if (input.justPressed('moveUp')) this.selected = Math.max(0, this.selected - 1);
    if (input.justPressed('confirm') || input.justPressed('interact')) {
      this._transact();
    }
    if (input.justPressed('dash')) this.mode = this.mode === 'buy' ? 'sell' : 'buy';
  }

  _items() {
    const g = this.game;
    const shopId = g.shop?.openShopId;
    if (!shopId) return [];
    if (this.mode === 'buy') return g.shop.listStock(shopId);
    return (g.inventory?.stacks ?? []).map((s) => ({
      itemId: s.itemId,
      def: g.inventory.getItemDef(s.itemId),
      price: g.shop.sellPrice(shopId, s.itemId),
      remaining: s.count,
    }));
  }

  _transact() {
    const g = this.game;
    const shopId = g.shop?.openShopId;
    const item = this._items()[this.selected];
    if (!shopId || !item) return;
    const res = this.mode === 'buy'
      ? g.shop.buy(shopId, item.itemId, 1, g.player, g.inventory)
      : g.shop.sell(shopId, item.itemId, 1, g.player, g.inventory);
    if (res.ok) {
      g.audio?.play('coin');
      if (this.mode === 'buy') g.player.recalcStats?.(g.inventory.equipmentBonuses());
    } else {
      g.audio?.play('error');
    }
  }

  render() {
    const ui = this.ui;
    const g = this.game;
    const vw = ui.renderer.width;
    const vh = ui.renderer.height;
    const x = vw / 2 - 150;
    const y = vh / 2 - 95;
    ui.panel(x, y, 300, 190, { title: g.t('screen.shop') });
    ui.text(`${g.t('shop.gold')}: ${formatGold(g.player?.gold ?? 0)}`, x + 288, y + 6, {
      align: 'right',
      size: 7,
      color: UI_THEME.gold,
    });
    ui.button(x + 10, y + 22, 70, 14, g.t('shop.buy'), {
      onClick: () => { this.mode = 'buy'; },
      bg: this.mode === 'buy' ? UI_THEME.borderDark : undefined,
    });
    ui.button(x + 86, y + 22, 70, 14, g.t('shop.sell'), {
      onClick: () => { this.mode = 'sell'; },
      bg: this.mode === 'sell' ? UI_THEME.borderDark : undefined,
    });
    const items = this._items();
    const clicked = ui.list(x + 10, y + 42, 200, 138, items, {
      id: `shop-${this.mode}`,
      selectedIndex: this.selected,
      rowH: 20,
      renderRow: (item, ix, iy, iw, ih, meta) => {
        const def = item.def ?? {};
        ui.text(def.name?.[g.lang] ?? item.itemId, ix + 4, iy + 6, {
          size: 6,
          color: meta.selected ? UI_THEME.accent : RARITY[def.rarity ?? 'common']?.color ?? UI_THEME.text,
        });
        ui.text(formatGold(item.price ?? 0) + 'g', ix + iw - 6, iy + 6, {
          size: 6,
          align: 'right',
          color: UI_THEME.gold,
        });
      },
    });
    if (clicked >= 0) this.selected = clicked;
    ui.button(x + 218, y + 42, 72, 18, this.mode === 'buy' ? g.t('shop.buy') : g.t('shop.sell'), {
      onClick: () => this._transact(),
    });
    ui.button(x + 218, y + 66, 72, 18, g.t('menu.close'), {
      onClick: () => {
        g.shop?.close();
        this.game.closeScreen();
      },
    });
  }
}
