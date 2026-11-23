/**
 * game.js — top-level game controller: boot, scene flow, glue between the
 * engine, the world, UI screens and the five integrations.
 */
import { Engine } from '../core/engine.js';
import { Renderer } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { gameEvents, Events } from '../core/events.js';
import { PerformanceGovernor, Tiers } from '../core/performance.js';
import { Storage, storage } from '../core/storage.js';
import { TweenManager } from '../core/tween.js';
import { Player } from '../entities/player.js';
import { resetEntityIds } from '../entities/entity.js';
import { Inventory, grantStarterKit } from '../systems/inventory.js';
import { SkillSystem } from '../systems/skills.js';
import { QuestSystem } from '../systems/quests.js';
import { AchievementSystem } from '../systems/achievements.js';
import { DialogueSystem } from '../systems/dialogue.js';
import { CraftingSystem } from '../systems/crafting.js';
import { ShopSystem } from '../systems/shop.js';
import { UI } from '../ui/ui.js';
import { HUD } from '../ui/hud.js';
import { TitleMenu, PauseMenu, GameOverScreen } from '../ui/menus.js';
import { ScreenManager } from '../ui/screens.js';
import { TouchControls } from '../ui/touchControls.js';
import { spriteBank } from '../gfx/spritegen.js';
import { Content } from './content.js';
import { World } from './world.js';
import { SaveManager, loadSettings, persistSettings } from '../save/saveManager.js';
import { IntegrationManager } from '../integrations/integrationManager.js';
import { SupabaseClient } from '../integrations/supabaseClient.js';
import { NotionClient } from '../integrations/notionClient.js';
import { GoogleDocsClient } from '../integrations/googleDocsClient.js';
import { LinearClient } from '../integrations/linearClient.js';
import { GithubClient } from '../integrations/githubClient.js';
import { OfflineQueue } from '../integrations/offlineQueue.js';
import { I18n } from '../i18n/i18n.js';
import { INTEGRATION_CONFIG } from '../data/integrationConfig.js';
import { grantStartingSkills } from './progression.js';

export const Scenes = {
  BOOT: 'boot',
  TITLE: 'title',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
};

export class Game {
  /**
   * @param {object} opts { canvas, config }
   */
  constructor(opts) {
    this.canvas = opts.canvas;
    this.config = opts.config ?? INTEGRATION_CONFIG;
    this.scene = Scenes.BOOT;
    this.lang = opts.lang ?? 'ar';
    this.i18n = new I18n(this.lang);
    this.storage = opts.storage ?? storage;
    this.settings = loadSettings({
      musicVolume: 0.45,
      sfxVolume: 0.8,
      quality: null,
      touchControls: true,
      screenShake: true,
      language: this.lang,
    });

    // engine & io
    this.renderer = new Renderer(this.canvas, { width: 480, height: 270 });
    this.input = new Input({ canvas: this.canvas });
    this.audio = audio;
    this.tweens = new TweenManager();
    this.performance = new PerformanceGovernor({
      tier: this.settings.quality ?? PerformanceGovernor.detectInitialTier(),
      auto: this.settings.quality === null,
      onTierChange: (tier, profile) => this._applyQuality(profile),
    });

    // content & systems
    this.content = new Content();
    this.player = null;
    this.world = null;
    this.inventory = null;
    this.skills = null;
    this.quests = null;
    this.achievements = null;
    this.dialogue = null;
    this.crafting = null;
    this.shop = null;
    this.progress = { levelsCleared: [], chestsOpened: [], secretsFound: [], score: 0 };

    // ui
    this.ui = new UI(this.renderer, this.input);
    this.hud = new HUD(this.ui, this);
    this.titleMenu = new TitleMenu(this.ui, this);
    this.pauseMenu = new PauseMenu(this.ui, this);
    this.gameOverScreen = new GameOverScreen(this.ui, this);
    this.screens = new ScreenManager(this.ui, this);
    this.touch = new TouchControls(this.input);
    this.touch.setEnabled(this.settings.touchControls && this._isTouchDevice());

    // integrations
    const queue = new OfflineQueue(this.storage);
    this.integrations = new IntegrationManager({
      config: this.config,
      storage: this.storage,
      queue,
      clients: {
        supabase: new SupabaseClient(this.config.supabase ?? {}),
        notion: new NotionClient(this.config.notion ?? {}),
        googleDocs: new GoogleDocsClient(this.config.googleDocs ?? {}),
        linear: new LinearClient(this.config.linear ?? {}),
        github: new GithubClient(this.config.github ?? {}),
      },
    });

    this.saveManager = new SaveManager(
      {
        items: this.content.items,
        skills: this.content.skills,
        quests: this.content.quests,
        achievements: this.content.achievements,
        dialogues: this.content.dialogues,
      },
      { storage: this.storage, integrations: this.integrations },
    );

    // engine loop
    this.engine = new Engine({
      update: (dt) => this.update(dt),
      render: (alpha, frameNo) => this.render(alpha, frameNo),
      onStats: (stats) => this._onStats(stats),
    });

    this.totalPlayTime = 0;
    this.pendingSpawn = null;
    this.uiLocked = false;
    this._integrationTick = 0;
    this._booted = false;
    this.sprites = {
      icon: (kind, colors) => spriteBank.icon(kind, colors),
      character: (id, colors, frame) => spriteBank.character(id, colors, frame),
      creature: (id, family, colors, frame) => spriteBank.creature(id, family, colors, frame),
    };
  }

  // ---------------------------------------------------------------- boot

  boot() {
    if (this._booted) return this;
    this._booted = true;
    resetEntityIds();
    this._applyQuality(this.performance.profile);
    this.audio.setMusicVolume(this.settings.musicVolume);
    this.audio.setSfxVolume(this.settings.sfxVolume);
    this.integrations.init();
    this.scene = Scenes.TITLE;
    gameEvents.emit(Events.READY, { game: this });

    // unlock audio on first interaction (browser autoplay policy)
    const unlock = () => {
      this.audio.unlock();
      if (this.scene === Scenes.TITLE) this.audio.playMusic('dunes');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }
    this.engine.start();
    return this;
  }

  // -------------------------------------------------------------- scenes

  startNewGame() {
    this.audio.unlock();
    this.audio.play('uiConfirm');
    resetEntityIds();
    this.player = new Player({ name: 'Wanderer' });
    this.inventory = new Inventory(this.content.items);
    grantStarterKit(this.inventory);
    this.inventory.onEquipChanged = (bonuses) => this.player.recalcStats(bonuses);
    this.player.recalcStats(this.inventory.equipmentBonuses());
    this.skills = new SkillSystem(this.content.skills);
    grantStartingSkills(this.skills);
    this.quests = new QuestSystem(this.content.quests).bootstrap().bindEvents();
    this.achievements = new AchievementSystem(this.content.achievements).bindEvents();
    this.dialogue = new DialogueSystem(this.content.dialogues);
    this.crafting = new CraftingSystem(this.content.recipes, this.content.items);
    this.shop = new ShopSystem(this.content.shops, this.content.items);
    this.progress = { levelsCleared: [], chestsOpened: [], secretsFound: [], score: 0 };
    this.world = new World(this);
    const firstId = this.content.firstLevelId();
    this.world.loadLevel(firstId);
    this.player.x = this.world.spawnPoint.x;
    this.player.y = this.world.spawnPoint.y;
    this.player.data.map = this.world.map;
    this.scene = Scenes.PLAYING;
    this.hud.showBanner(
      this.i18n.pick(this.content.level(firstId)?.name) ?? firstId,
      this.t('game.newGameHint'),
      3.2,
    );
    this.audio.playMusic('dunes');
    // opening vision
    if (this.content.dialogue('dlg-intro-vision')) {
      this.dialogue.start('dlg-intro-vision', null, this._dialogueCtx());
    }
    gameEvents.emit(Events.GAME_START, { game: this });
  }

  continueGame() {
    this.audio.unlock();
    // build the runtime first, then restore into it
    this.startNewGame();
    const ok = this.saveManager.load(this);
    if (ok) {
      this.audio.play('save');
      this.ui.toast(this.t('toast.loaded'), { color: '#63c76a' });
      const spawn = this.pendingSpawn;
      if (spawn?.levelId && spawn.levelId !== this.world.levelId) {
        this.world.loadLevel(spawn.levelId);
      }
      if (spawn && Number.isFinite(spawn.x)) {
        this.player.x = spawn.x;
        this.player.y = spawn.y;
      } else {
        this.player.x = this.world.spawnPoint.x;
        this.player.y = this.world.spawnPoint.y;
      }
      this.pendingSpawn = null;
    }
    return ok;
  }

  hasSave() {
    return this.saveManager.hasSave();
  }

  saveGame(showToast = false) {
    if (!this.player) return false;
    const ok = this.saveManager.save(this);
    if (ok) {
      this.audio.play('save');
      if (showToast) this.ui.toast(this.t('toast.saved'), { color: '#63c76a' });
    }
    return ok;
  }

  loadGame() {
    if (!this.player) return this.continueGame();
    const ok = this.saveManager.load(this);
    if (ok) {
      this.ui.toast(this.t('toast.loaded'), { color: '#63c76a' });
      const spawn = this.pendingSpawn;
      if (spawn?.levelId && this.world) this.world.loadLevel(spawn.levelId);
      if (spawn && Number.isFinite(spawn.x)) {
        this.player.x = spawn.x;
        this.player.y = spawn.y;
      }
      this.pendingSpawn = null;
    }
    return ok;
  }

  gotoLevel(levelId, spawnIndex = 0) {
    if (!this.world) return;
    const level = this.world.loadLevel(levelId);
    const spawns = level.spawns ?? [level.spawn];
    const s = spawns[spawnIndex] ?? spawns[0] ?? level.spawn;
    const px = this.world.map.tileToPixel(s.x, s.y);
    this.player.x = px.x;
    this.player.y = px.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.data.map = this.world.map;
    this.world._victoryFired = false;
    this.hud.showBanner(
      this.i18n.pick(level.name) ?? levelId,
      this.i18n.pick(level.subtitle) ?? '',
      2.6,
    );
    this.audio.playMusic(level.music ?? (this.world.dayNight.isNight ? 'night' : 'dunes'));
  }

  onLevelCleared(levelId) {
    if (!this.progress.levelsCleared.includes(levelId)) {
      this.progress.levelsCleared.push(levelId);
    }
    this.world?.markCleared();
    this.hud.showBanner(this.t('game.victory'), '', 2.2);
    this.audio.play('levelUp');
    this.saveGame(false);
  }

  respawnOrTitle() {
    if (this.player && this.world) {
      this.player.respawn(this.world.spawnPoint.x, this.world.spawnPoint.y);
      this.scene = Scenes.PLAYING;
    } else {
      this.returnToTitle();
    }
  }

  returnToTitle() {
    this.saveGame(false);
    this.scene = Scenes.TITLE;
    this.audio.playMusic('dunes');
    gameEvents.emit(Events.GAME_OVER, { game: this });
  }

  pause() {
    if (this.scene !== Scenes.PLAYING) return;
    this.scene = Scenes.PAUSED;
    gameEvents.emit(Events.GAME_PAUSE, {});
  }

  resume() {
    if (this.scene !== Scenes.PAUSED) return;
    this.scene = Scenes.PLAYING;
    gameEvents.emit(Events.GAME_RESUME, {});
  }

  // -------------------------------------------------------------- update

  update(dt) {
    // shared timers
    this.tweens.update(dt);
    this.input.pollGamepad();
    this.totalPlayTime += dt;

    switch (this.scene) {
      case Scenes.TITLE:
        this.titleMenu.update(dt);
        break;
      case Scenes.PLAYING: {
        if (this.input.justPressed('pause')) {
          this.pause();
          break;
        }
        if (this.input.justPressed('inventory')) { this.openScreen('inventory'); break; }
        if (this.input.justPressed('map')) { this.openScreen('map'); break; }
        if (this.input.justPressed('quests')) { this.openScreen('quests'); break; }
        if (this.input.justPressed('codex')) { this.openScreen('codex'); break; }
        if (this.input.justPressed('quickSave')) { this.saveGame(true); }
        if (this.input.justPressed('quickLoad')) { this.loadGame(); }

        this.uiLocked = this.screens.isOpen() || (this.dialogue?.isTalking() ?? false);
        if (this.screens.isOpen()) {
          this.screens.update(dt);
        } else if (this.dialogue?.isTalking()) {
          this._updateDialogue();
        } else if (this.world) {
          this.world.update(dt, this.input);
          if (!this.player.alive && this.player.state === 'dead') {
            this.scene = Scenes.GAMEOVER;
          }
        }
        this.skills?.update(dt);
        this.hud.update(dt);
        break;
      }
      case Scenes.PAUSED:
        this.pauseMenu.update(dt);
        break;
      case Scenes.GAMEOVER:
        this.gameOverScreen.update(dt);
        break;
      default:
        break;
    }

    // integration heartbeat
    this._integrationTick += dt;
    if (this._integrationTick > 30) {
      this._integrationTick = 0;
      this.integrations.tick();
    }

    this.input.endFrame();
  }

  _updateDialogue() {
    const input = this.input;
    const choices = this.dialogue.availableChoices(this._dialogueCtx());
    if (input.justPressed('confirm') || input.justPressed('interact') || input.justPressed('attack')) {
      if (choices.length === 0) {
        this.dialogue.choose(0, this._dialogueCtx());
      } else if (!this._dialogueChoice) {
        this._dialogueChoice = 0;
      } else {
        this.dialogue.choose(this._dialogueChoice, this._dialogueCtx());
        this._dialogueChoice = 0;
      }
      this.audio.play('uiMove');
    }
    if (choices.length > 0) {
      if (input.justPressed('moveDown')) {
        this._dialogueChoice = Math.min(choices.length - 1, (this._dialogueChoice ?? 0) + 1);
      }
      if (input.justPressed('moveUp')) {
        this._dialogueChoice = Math.max(0, (this._dialogueChoice ?? 0) - 1);
      }
    }
    if (input.justPressed('cancel')) {
      this.dialogue.end();
    }
    if (!this.dialogue.isTalking() && this.shop?.isOpen()) {
      this.openScreen('shop');
    }
  }

  _dialogueCtx() {
    return {
      player: this.player,
      inventory: this.inventory,
      quests: this.quests,
      skills: this.skills,
      shop: this.shop,
      world: this.world,
      audio: this.audio,
    };
  }

  startDialogue(npc) {
    const dialogueId = npc.dialogueId
      ?? (npc.role === 'merchant' ? 'dlg-merchant-01' : null)
      ?? (npc.role === 'smith' ? 'dlg-smith-01' : null)
      ?? (npc.role === 'healer' ? 'dlg-healer-01' : null)
      ?? (npc.role === 'guard' ? 'dlg-guard-01' : null)
      ?? 'dlg-elder-intro';
    this.audio.play('uiConfirm');
    this.dialogue.start(dialogueId, npc, this._dialogueCtx());
    gameEvents.emit(Events.DIALOGUE_START, { npcId: npc.npcId, dialogueId });
  }

  // ---------------------------------------------------------------- render

  render(alpha, frameNo) {
    const r = this.renderer;
    const cam = r.camera;
    if (this.world && this.player && (this.scene === Scenes.PLAYING || this.scene === Scenes.PAUSED || this.scene === Scenes.GAMEOVER)) {
      cam.viewW = r.width;
      cam.viewH = r.height;
      if (this.world.map) {
        cam.bounds = { x: 0, y: 0, w: this.world.map.pixelWidth, h: this.world.map.pixelHeight };
      }
      cam.follow(this.player.x, this.player.y + 6, 1 / 60, 0.1);

      r.begin('#1a1220');
      this.world.map.render(r.bctx, this.world.tileSet, cam, { fog: true });
      this._renderEntities();
      this.world.particles.render(r.bctx, cam);
      this.world.combat.renderFloaters(r.bctx, cam);

      // time/weather tint
      const tint = this.world.dayNight.tint();
      const wtint = this.world.weather.tint();
      r.drawTint(tint.color, tint.alpha);
      r.drawTint(wtint.color, wtint.alpha);

      // HUD
      r.beginScreenSpace();
      this.hud.render();
      if (this.settings.touchControls) this.touch.render(r.bctx);
      if (this.screens.isOpen()) {
        this.ui.beginFrame(1 / 60);
        this.screens.render();
      }
      if (this.dialogue?.isTalking()) {
        this._renderDialogue();
      }
      r.endWorldSpace();
      r.end();
    } else if (this.scene === Scenes.TITLE) {
      r.begin('#17111f');
      r.beginScreenSpace();
      this.ui.beginFrame(1 / 60);
      this.titleMenu.render();
      this.ui.renderToasts();
      this.ui.drawTooltip();
      r.endWorldSpace();
      r.end();
    } else {
      r.begin('#17111f');
      r.end();
    }
    void alpha;
    void frameNo;
  }

  _renderEntities() {
    const r = this.renderer;
    const cam = r.camera;
    const ctx = r.bctx;
    const world = this.world;
    const drawShadow = (x, y, w) => {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    // sort by y for pseudo-depth
    const drawable = world.entities
      .filter((e) => e.alive !== false && cam.isVisible(e.x, e.y, 40))
      .sort((a, b) => a.y - b.y);

    for (const e of drawable) {
      if (e.kind === 'player') continue; // drawn with enemies pass below
      switch (e.kind) {
        case 'enemy':
        case 'boss': {
          drawShadow(e.x, e.y + 8, e.radius);
          const recipe = this.content.enemy(e.def?.id)?.family ?? 'insect';
          const frame = e.state === 'walk' || e.state === 'chase' ? e.animFrame % 2 : 0;
          const sprite = spriteBank.creature(e.def?.id ?? 'bug', recipe, {
            body: e.def?.family === 'bossGolem' ? '#b08c5c' : undefined,
          }, frame);
          if (sprite && !sprite.__stub) {
            ctx.save();
            if (e.flashTimer > 0) ctx.globalAlpha = 0.6;
            if (e.facing < 0) {
              ctx.translate(e.x + 8, e.y - 12 - (e.z ?? 0));
              ctx.scale(-1, 1);
              ctx.drawImage(sprite, 0, 0);
            } else {
              ctx.drawImage(sprite, e.x - 8, e.y - 12 - (e.z ?? 0));
            }
            ctx.restore();
          }
          // small hp pip for wounded enemies
          if (e.hp < e.maxHp && e.alive) {
            const w = 16;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(e.x - w / 2, e.y - 18, w, 2);
            ctx.fillStyle = '#e05548';
            ctx.fillRect(e.x - w / 2, e.y - 18, w * (e.hp / e.maxHp), 2);
          }
          break;
        }
        case 'npc': {
          drawShadow(e.x, e.y + 8, 7);
          const colors = NPC_PALETTE[e.role] ?? NPC_PALETTE.villager;
          const sprite = spriteBank.character(e.sprite ?? e.role, colors, 0);
          if (sprite && !sprite.__stub) {
            if (e.facing < 0) {
              ctx.save();
              ctx.translate(e.x + 8, e.y - 12);
              ctx.scale(-1, 1);
              ctx.drawImage(sprite, 0, 0);
              ctx.restore();
            } else {
              ctx.drawImage(sprite, e.x - 8, e.y - 12);
            }
          }
          // name tag
          r.drawText(this.i18n.pick(e.name), e.x, e.y - 22, {
            align: 'center',
            size: 6,
            color: '#f5e9d0',
          });
          // quest marker
          if (e.questIds?.length) {
            r.drawText('!', e.x, e.y - 32, { align: 'center', size: 10, color: '#f2c94c', bold: true });
          }
          break;
        }
        case 'chest': {
          drawShadow(e.x, e.y + 8, 8);
          const sprite = spriteBank.icon('coin', { main: e.secret ? '#b267e0' : '#8c622c', accent: '#e8b64c' });
          if (sprite && !sprite.__stub) ctx.drawImage(sprite, e.x - 8, e.y - 12);
          if (!e.opened && e.secret) {
            r.drawText('?', e.x, e.y - 24, { align: 'center', size: 8, color: '#b267e0' });
          }
          break;
        }
        case 'portal': {
          const glow = 0.5 + Math.sin((e.animTimer ?? 0) * 3) * 0.2;
          r.drawCircle(e.x, e.y - 4, 10, `rgba(178,103,224,${glow})`);
          r.drawCircle(e.x, e.y - 4, 6, `rgba(232,192,248,${glow + 0.2})`);
          break;
        }
        case 'loot': {
          const bob = Math.sin((e.bobTimer ?? 0)) * 1.5;
          const icon = e.lootType === 'coin' ? 'coin' : e.lootType === 'heart' ? 'potion' : 'gem';
          const colors = e.lootType === 'coin'
            ? { main: '#f2c94c', accent: '#f5e9d0' }
            : e.lootType === 'heart'
              ? { main: '#e05548', accent: '#f5e9d0' }
              : { main: '#63c76a', accent: '#bfe8f5' };
          const sprite = spriteBank.icon(icon, colors);
          if (sprite && !sprite.__stub) ctx.drawImage(sprite, e.x - 6, e.y - 12 + bob, 12, 12);
          break;
        }
        default:
          break;
      }
    }

    // player on top
    const p = this.player;
    if (p && cam.isVisible(p.x, p.y, 40)) {
      drawShadow(p.x, p.y + 8, 7);
      const frame = p.state === 'walk' ? 1 + (p.animFrame % 2) : p.state === 'attack' ? 3 : 0;
      const sprite = spriteBank.character('wanderer', {
        skin: '#e8b88a',
        cloth: '#4a6fa5',
        accent: '#e8b64c',
        hair: '#2c1808',
        boots: '#4a2c18',
        weapon: this.inventory?.equipment?.weapon ? 'sword' : null,
      }, frame);
      if (sprite && !sprite.__stub) {
        ctx.save();
        if (p.flashTimer > 0 || (p.invulnTimer > 0 && Math.floor(p.stateTime * 12) % 2 === 0)) {
          ctx.globalAlpha = 0.55;
        }
        if (p.facing < 0) {
          ctx.translate(p.x + 8, p.y - 12);
          ctx.scale(-1, 1);
          ctx.drawImage(sprite, 0, 0);
        } else {
          ctx.drawImage(sprite, p.x - 8, p.y - 12);
        }
        ctx.restore();
      }
    }
  }

  _renderDialogue() {
    const ui = this.ui;
    const node = this.dialogue.currentNode();
    if (!node) return;
    const vw = this.renderer.width;
    const vh = this.renderer.height;
    const x = 14;
    const w = vw - 28;
    const y = vh - 92;
    ui.panel(x, y, w, 82, { alpha: 0.94 });
    const speaker = this.i18n.pick(node.speaker);
    if (speaker) {
      ui.text(speaker, x + 10, y + 6, { size: 7, color: '#e8b64c', bold: true });
    }
    ui.paragraph(this.i18n.pick(node.text), x + 10, y + 18, w - 20, { size: 7, lineHeight: 3 });
    const choices = this.dialogue.availableChoices(this._dialogueCtx());
    if (choices.length > 0) {
      let cy = y + 56;
      choices.forEach((choice, i) => {
        const selected = (this._dialogueChoice ?? 0) === i;
        ui.text(`${selected ? '▶' : ' '} ${this.i18n.pick(choice.text)}`, x + 16, cy, {
          size: 6,
          color: selected ? '#e8b64c' : '#f5e9d0',
        });
        cy += 9;
      });
    } else {
      ui.text('▼', x + w - 18, y + 68, { size: 8, color: '#e8b64c' });
    }
    void this.dialogue;
  }

  // --------------------------------------------------------------- misc

  openScreen(name) {
    this.screens.open(name);
    this.audio.play('uiMove');
    gameEvents.emit(Events.UI_OPEN, { screen: name });
  }

  closeScreen() {
    this.screens.close();
    this.audio.play('uiCancel');
    gameEvents.emit(Events.UI_CLOSE, {});
  }

  turnInQuest(questId) {
    if (this.quests.complete(questId, this.player, this.inventory)) {
      this.ui.toast(this.t('toast.questDone'), { color: '#63c76a' });
      this.audio.play('quest');
    }
  }

  applyConsumable(def) {
    if (!this.inventory.use(def.id, this.player)) return false;
    if (def.heal) {
      this.player.heal(def.heal);
      this.audio.play('heal');
    }
    if (def.mana) {
      this.player.mana = Math.min(this.player.stats.maxMana, this.player.mana + def.mana);
    }
    return true;
  }

  useSkill(slot) {
    if (!this.skills || !this.player) return;
    const res = this.skills.castSlot(slot, this.player, {
      world: this.world,
      combat: this.world?.combat,
      particles: this.world?.particles,
      audio: this.audio,
      enemies: this.world?.enemies ?? [],
    });
    if (!res.ok && res.reason === 'mana') this.audio.play('error');
    if (res.ok) this.audio.play('uiConfirm');
  }

  setLanguage(lang) {
    if (this.i18n.setLanguage(lang)) {
      this.lang = lang;
      this.settings.language = lang;
      persistSettings(this.settings);
      gameEvents.emit(Events.LANGUAGE_CHANGED, { lang });
    }
  }

  setQuality(tier) {
    this.performance.pin(tier);
    this.settings.quality = tier;
    persistSettings(this.settings);
    this._applyQuality(this.performance.profile);
    this.audio.play('uiConfirm');
  }

  setSetting(key, value) {
    this.settings[key] = value;
    persistSettings(this.settings);
    if (key === 'touchControls') this.touch.setEnabled(value && this._isTouchDevice());
  }

  _applyQuality(profile) {
    if (this.engine) this.engine.setRenderEvery(profile.renderEvery);
    if (this.world?.particles) this.world.particles.setCapacity(profile.maxParticles);
    this.audio.maxVoices = profile.audioVoices;
    gameEvents.emit(Events.QUALITY_CHANGED, { profile });
  }

  _onStats(stats) {
    this.performance.sample(stats.fps);
  }

  _isTouchDevice() {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || (navigator?.maxTouchPoints ?? 0) > 0;
  }

  t(key, params) {
    return this.i18n.t(key, params);
  }
}

/** Character palettes for NPC rendering. */
const NPC_PALETTE = {
  merchant: { skin: '#d8a878', cloth: '#8c622c', accent: '#e8b64c', hair: '#1a1220', boots: '#4a2c18', beard: true },
  elder: { skin: '#d8b890', cloth: '#7a6a52', accent: '#c9a15e', hair: '#e8e8e8', boots: '#3a2c1c', beard: true, weapon: 'staff' },
  guard: { skin: '#e8b88a', cloth: '#6e7a8c', accent: '#c8ccd4', hair: '#2c1808', boots: '#2c2018', weapon: 'sword', helmet: true },
  healer: { skin: '#e8c8a0', cloth: '#59c2a8', accent: '#f5e9d0', hair: '#2c1808', boots: '#184a44', longHair: true },
  smith: { skin: '#c89868', cloth: '#7c4a38', accent: '#e8b64c', hair: '#2c1808', boots: '#4a2c18', beard: true },
  hunter: { skin: '#c89868', cloth: '#4c6b2f', accent: '#8a6a42', hair: '#2c1808', boots: '#3a2412', weapon: 'bow' },
  villager: { skin: '#e8b88a', cloth: '#b8a88c', accent: '#8a6a42', hair: '#2c1808', boots: '#4a2c18' },
};
