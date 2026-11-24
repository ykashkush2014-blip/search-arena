// Quantified goals ("مهام") that guide the player through a session.
// Pure JS: no DOM, so it can be exercised in node.

export const QUESTS = [
  {
    id: 'first-blocks',
    title: 'أول خطوة',
    desc: 'اكسر 10 مكعبات بيدك',
    target: 10,
    icon: '⛏️',
    listens: ['break'],
    progress(state) { return state.broken; },
  },
  {
    id: 'foundation',
    title: 'الأساس',
    desc: 'ضع 15 مكعباً',
    target: 15,
    icon: '🧱',
    listens: ['place'],
    progress(state) { return state.placed; },
  },
  {
    id: 'lumberjack',
    title: 'حتّاب',
    desc: 'اجمع 8 قطع خشب',
    target: 8,
    icon: '🪵',
    listens: ['break'],
    progress(state) { return state.logs; },
  },
  {
    id: 'crafter',
    title: 'النجّار',
    desc: 'اصنع 8 ألواح خشبية',
    target: 8,
    icon: '🔨',
    listens: ['craft'],
    progress(state) { return state.planksCrafted; },
  },
  {
    id: 'light',
    title: 'نوّر الليل',
    desc: 'ضع مصباحين',
    target: 2,
    icon: '💡',
    listens: ['place'],
    progress(state) { return state.lampsPlaced; },
  },
  {
    id: 'tower',
    title: 'باني الأبراج',
    desc: 'ابنِ حتى الارتفاع 30',
    target: 30,
    icon: '🗼',
    listens: ['place'],
    progress(state) { return Math.max(0, Math.floor(state.maxBuildY)); },
  },
  {
    id: 'explorer',
    title: 'مستكشف',
    desc: 'ابتعد 48 مكعباً عن البداية',
    target: 48,
    icon: '🧭',
    listens: ['move'],
    progress(state) { return Math.floor(state.furthest); },
  },
];

export class QuestLog {
  constructor(defs = QUESTS) {
    this.defs = defs;
    this.done = new Set();
    this.state = {
      broken: 0,
      placed: 0,
      logs: 0,
      planksCrafted: 0,
      lampsPlaced: 0,
      maxBuildY: 0,
      furthest: 0,
    };
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event) {
    for (const fn of this.listeners) fn(event);
  }

  /** Record a gameplay event and re-evaluate quests. */
  track(type, payload = {}) {
    const s = this.state;
    if (type === 'break') {
      s.broken += 1;
      if (payload.block === 5) s.logs += 1;
      if (payload.yield) {
        // keep chained updates below in sync
      }
    } else if (type === 'place') {
      s.placed += 1;
      if (payload.block === 13) s.lampsPlaced += 1;
      if (typeof payload.y === 'number') s.maxBuildY = Math.max(s.maxBuildY, payload.y + 1);
    } else if (type === 'craft') {
      if (payload.output === 7) s.planksCrafted += payload.count || 1;
    } else if (type === 'move') {
      if (typeof payload.distance === 'number') s.furthest = Math.max(s.furthest, payload.distance);
    }
    const newly = [];
    for (const q of this.defs) {
      if (this.done.has(q.id)) continue;
      if (q.progress(s) >= q.target) {
        this.done.add(q.id);
        newly.push(q);
      }
    }
    if (newly.length) this.emit({ type: 'complete', quests: newly, all: this.isComplete() });
    return newly;
  }

  entries() {
    return this.defs.map((q) => {
      const value = Math.min(q.target, q.progress(this.state));
      return { ...q, value, done: this.done.has(q.id), ratio: value / q.target };
    });
  }

  isComplete() {
    return this.done.size === this.defs.length;
  }

  serialize() {
    return { done: [...this.done], state: this.state };
  }

  restore(data) {
    if (!data) return;
    this.done = new Set(data.done || []);
    Object.assign(this.state, data.state || {});
  }
}
