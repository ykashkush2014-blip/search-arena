// CrazyGames platform bridge.
//
// The game ships as one self-contained .html and must keep working when it is
// opened from a USB stick, so nothing here is allowed to be required. The SDK
// is loaded from CrazyGames' CDN and, if it is missing, blocked, or running on
// a plain file:// page, every function below degrades to a no-op. That way the
// same build runs on the portal and off it.
//
// What the platform actually asks of us (docs.crazygames.com/requirements):
//   • gameplayStart/Stop on every play/pause transition — the first start
//     event is how they measure initial download size
//   • loadingStart/Stop around asset loading
//   • respect game.settings.muteAudio and game.settings.disableChat, and the
//     ?muteAudio=true / ?disableChat=true overrides
//   • no custom fullscreen button (the portal provides one)
//   • land the player in gameplay, or at most one click away
//   • report room data so friends can join, and handle invite links
//   • English UI, following systemInfo.locale when a translation exists
const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

const state = {
  sdk: null, // window.CrazyGames.SDK once initialised
  ready: false,
  isPortal: false, // running inside CrazyGames (portal or their iframe)
  settings: { muteAudio: false, disableChat: false },
  systemInfo: null,
  user: null,
  playing: false,
  instantMultiplayer: false,
  inviteParams: null,
  loading: false, // loadingStart() was called before the SDK was ready
};

const query = () => new URLSearchParams(location.search);

// A downloaded copy / file:// page cannot reach the SDK, and we should not
// wait for a timeout in that case.
function canLoadSdk() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function loadSdk() {
  if (window.CrazyGames && window.CrazyGames.SDK) return Promise.resolve(window.CrazyGames.SDK);
  if (!canLoadSdk()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement("script");
    el.src = SDK_URL;
    el.async = true;
    // A blocked or offline CDN must not hold the game hostage.
    const done = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 4000);
    el.onload = () => done(window.CrazyGames && window.CrazyGames.SDK ? window.CrazyGames.SDK : null);
    el.onerror = () => done(null);
    document.head.appendChild(el);
  });
}

// The portal embeds the game in an iframe on crazygames.com; the SDK also
// exposes systemInfo.applicationType. Either signal is enough to treat this
// as a portal run, but we never *require* it.
function looksLikePortal() {
  try {
    if (/crazygames\.(com|co\.uk)$/.test(location.hostname)) return true;
    if (window.parent && window.parent !== window) return true;
    if (window.CrazyGames && window.CrazyGames.SDK) return true;
  } catch {
    return false;
  }
  return false;
}

// --------------------------------------------------------------- settings ---
function readSettings(sdk) {
  const s = (sdk && sdk.game && sdk.game.settings) || {};
  let mute = !!s.muteAudio;
  let noChat = !!s.disableChat;
  // Local testing hooks documented by CrazyGames.
  if (query().get("muteAudio") === "true") mute = true;
  if (query().get("disableChat") === "true") noChat = true;
  state.settings = { muteAudio: mute, disableChat: noChat };
  return state.settings;
}

// --------------------------------------------------------------- lifecycle ---
export async function initCrazyGames() {
  const sdk = await loadSdk();
  state.isPortal = looksLikePortal();
  if (!sdk) {
    // Offline / self-hosted: still honour the query overrides so a reviewer
    // can reproduce both states without the SDK present.
    readSettings(null);
    state.ready = true;
    return state;
  }
  try {
    await sdk.init();
    state.sdk = sdk;
    state.ready = true;
    state.isPortal = true;
    readSettings(sdk);
    state.systemInfo = sdk.user && sdk.user.systemInfo ? sdk.user.systemInfo : null;
    // Replay a load start that happened before we were initialised.
    if (state.loading) {
      try {
        sdk.game.loadingStart?.();
      } catch {
        /* ignore */
      }
    }
    state.instantMultiplayer = !!(sdk.game && sdk.game.isInstantMultiplayer);
    state.inviteParams = (sdk.game && sdk.game.inviteParams) || null;
    if (sdk.game && typeof sdk.game.addSettingsChangeListener === "function") {
      sdk.game.addSettingsChangeListener((next) => {
        // muteAudio from the portal takes priority over the in-game toggle.
        state.settings = {
          muteAudio: !!next.muteAudio || query().get("muteAudio") === "true",
          disableChat: !!next.disableChat || query().get("disableChat") === "true",
        };
        state.onSettingsChange.forEach((fn) => {
          try {
            fn(state.settings);
          } catch {
            /* a broken listener must not break the game */
          }
        });
      });
    }
  } catch {
    state.sdk = null;
    state.ready = true;
  }
  return state;
}

state.onSettingsChange = [];

export function onSettingsChange(fn) {
  if (typeof fn === "function") state.onSettingsChange.push(fn);
}

export const getSettings = () => state.settings;
export const isMuted = () => state.settings.muteAudio;
export const isChatDisabled = () => state.settings.disableChat;
export const isPortal = () => state.isPortal;
export const isReady = () => state.ready;
export const isInstantMultiplayer = () => state.instantMultiplayer;
export const getInviteParams = () => state.inviteParams;
export const getSystemInfo = () => state.systemInfo;

// The portal asks for a locale; the game has en + ar, everything else gets en.
export function preferredLanguage() {
  const info = state.systemInfo;
  const raw = (info && info.locale) || (navigator.language || "en");
  return String(raw).toLowerCase().startsWith("ar") ? "ar" : "en";
}

// ----------------------------------------------------------------- events ---
// gameplayStart marks the player entering a playable state. Calling it more
// than once in a row is harmless, so the callers do not need to be careful.
export function gameplayStart() {
  if (state.playing) return;
  state.playing = true;
  try {
    state.sdk?.game?.gameplayStart?.();
  } catch {
    /* SDK present but unhappy: never surface that to the player */
  }
}

export function gameplayStop() {
  if (!state.playing) return;
  state.playing = false;
  try {
    state.sdk?.game?.gameplayStop?.();
  } catch {
    /* ignore */
  }
}

// These two are called from module top level, before initCrazyGames() has
// resolved, so the call is remembered and replayed once the SDK is live.
// Without that the portal sees a load stop with no matching start and cannot
// measure the game's download size at all.
export function loadingStart() {
  state.loading = true;
  try {
    state.sdk?.game?.loadingStart?.();
  } catch {
    /* ignore */
  }
}

export function loadingStop() {
  state.loading = false;
  try {
    state.sdk?.game?.loadingStop?.();
  } catch {
    /* ignore */
  }
}

// Confetti on the big moments only — a win, not every level.
export function happytime() {
  try {
    state.sdk?.game?.happytime?.();
  } catch {
    /* ignore */
  }
}

export function reportProgress(percent) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  try {
    state.sdk?.game?.reportGameCompletedPercentage?.(p);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ rooms ---
// Room data is what powers the portal's Join/Invite UI. `roomId` must be
// unique within the game at a given moment; our lobby codes already are.
export function roomJoined(roomId, { joinable = true, params = null } = {}) {
  try {
    const inviteParams = params || { room: String(roomId) };
    state.sdk?.game?.updateRoom?.({ roomId: String(roomId), isJoinable: joinable, inviteParams });
  } catch {
    /* ignore */
  }
}

export function roomJoinable(joinable) {
  try {
    state.sdk?.game?.updateRoom?.({ isJoinable: !!joinable });
  } catch {
    /* ignore */
  }
}

export function roomLeft() {
  try {
    state.sdk?.game?.leftRoom?.();
  } catch {
    /* ignore */
  }
}

// Fired when the player accepts an invite while already in the game.
export function onJoinRoom(fn) {
  try {
    state.sdk?.game?.addJoinRoomListener?.((params) => {
      try {
        fn(params || {});
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

export async function inviteLink(params) {
  try {
    return await state.sdk?.game?.inviteLink?.(params);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- user ---
// Only for showing names/avatars; never used for authentication.
export async function getUser() {
  if (!state.sdk || !state.sdk.user || state.sdk.user.isUserAccountAvailable === false) return null;
  try {
    state.user = await state.sdk.user.getUser();
    return state.user;
  } catch {
    return null;
  }
}

export const getCachedUser = () => state.user;

// ------------------------------------------------------------------ video ---
// Midgame ad at a natural break: the end-of-match screen. The portal takes
// care of frequency (max one per three minutes) and unfilled ads, so we only
// have to keep the game paused until the callback lands.
export function requestMidgameAd({ onStarted, onFinished } = {}) {
  if (!state.sdk) return false;
  const wasPlaying = state.playing;
  try {
    state.sdk.ad.requestAd("midgame", {
      adStarted: () => {
        try {
          onStarted?.();
        } catch {
          /* ignore */
        }
      },
      adFinished: () => {
        try {
          onFinished?.();
        } catch {
          /* ignore */
        }
        if (wasPlaying) gameplayStart();
      },
      adError: () => {
        // Unfilled, blocked, or disabled (Basic Launch): carry on silently.
        try {
          onFinished?.();
        } catch {
          /* ignore */
        }
        if (wasPlaying) gameplayStart();
      },
    });
    return true;
  } catch {
    return false;
  }
}

// Same for a rewarded ad, but only where the reward itself is meaningful and
// the player asked for it. Returns the promise the caller awaits.
export function requestRewardedAd() {
  return new Promise((resolve) => {
    if (!state.sdk) return resolve(false);
    try {
      state.sdk.ad.requestAd("rewarded", {
        adFinished: () => resolve(true),
        adError: () => resolve(false),
      });
    } catch {
      resolve(false);
    }
  });
}

export const hasSdk = () => !!state.sdk;
