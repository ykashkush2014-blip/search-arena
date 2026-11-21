// Node entry point for the simulation core. The exact same modules that run in
// the browser are used by the online server, so both sides always agree on the
// rules. The map data lives in data/world.json (plain JSON) because Node cannot
// import the browser bundle (data/world-data.js) without a package.json type
// declaration; scripts/build_world.py writes both files.
import { readFileSync } from "node:fs";
import { setWorldData, World, difficultyOf, PRESETS } from "./world.js";
import { Game, Nation, powerSnapshot } from "./state.js";
import { BUILDINGS, BUILDING_BY_KEY, BALANCE, ERAS, RANKS, MEDALS } from "./data.js";

const WORLD = JSON.parse(readFileSync(new URL("../data/world.json", import.meta.url), "utf8"));
setWorldData(WORLD);

export {
  World,
  Game,
  Nation,
  powerSnapshot,
  BUILDINGS,
  BUILDING_BY_KEY,
  BALANCE,
  ERAS,
  RANKS,
  MEDALS,
  difficultyOf,
  PRESETS,
  WORLD,
};
