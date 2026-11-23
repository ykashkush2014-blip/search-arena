/**
 * i18n.js — bilingual string tables with RTL support. `t(key)` resolves a
 * dotted key against the active language with English fallback.
 */
import { EN } from './en.js';
import { AR } from './ar.js';
import { isRTL } from '../gfx/font.js';

const TABLES = { en: EN, ar: AR };

export class I18n {
  constructor(lang = 'ar') {
    this.lang = TABLES[lang] ? lang : 'ar';
    this.listeners = [];
    this.extraTables = {}; // generated string extensions
  }

  /** Register additional string tables (from generated content). */
  extend(lang, table) {
    this.extraTables[lang] = { ...(this.extraTables[lang] ?? {}), ...table };
    return this;
  }

  setLanguage(lang) {
    if (!TABLES[lang]) return false;
    this.lang = lang;
    for (const fn of this.listeners) fn(lang);
    return true;
  }

  onChange(fn) {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  get dir() {
    return this.lang === 'ar' ? 'rtl' : 'ltr';
  }

  get rtl() {
    return this.lang === 'ar';
  }

  /**
   * Resolve a key like "menu.newGame". Supports {param} interpolation.
   */
  t(key, params = null) {
    const table = TABLES[this.lang] ?? EN;
    const extra = this.extraTables[this.lang] ?? {};
    let value = lookup(table, key) ?? lookup(extra, key) ?? lookup(EN, key) ?? key;
    if (params) {
      for (const [name, val] of Object.entries(params)) {
        value = value.split(`{${name}}`).join(String(val));
      }
    }
    return value;
  }

  /** Localized name/desc pairs used across data tables. */
  pick(pair) {
    if (!pair) return '';
    if (typeof pair === 'string') return pair;
    return pair[this.lang] ?? pair.en ?? Object.values(pair)[0] ?? '';
  }

  /** Direction for a specific string. */
  dirOf(text) {
    return isRTL(text) ? 'rtl' : 'ltr';
  }
}

function lookup(table, key) {
  const parts = key.split('.');
  let node = table;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function createI18n(lang) {
  return new I18n(lang);
}
