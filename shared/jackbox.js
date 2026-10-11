const CRANK_KEYS = ['jack_crank', 'circusCrank', 'jackCrank'];

// Client and both servers must agree, including rooms using older state aliases.
export function getJackboxState(state) {
  const puzzles = state?.circusPuzzles || {};
  const inventory = state?.circusInventory || {};
  const crankInserted = !!(puzzles.jackCrankInserted || puzzles.crankInserted ||
    CRANK_KEYS.some(key => inventory[key]?.inserted));
  return {
    hasCrank: crankInserted || !!(puzzles.crankCollected ||
      CRANK_KEYS.some(key => inventory[key]?.collected)),
    crankInserted,
    open: !!(puzzles.jackBoxUnlocked || puzzles.jackSpringPopped || puzzles.jackPopped)
  };
}

export function insertJackCrank(state) {
  if (!getJackboxState(state).hasCrank) return false;
  state.circusPuzzles.jackCrankInserted = true;
  state.circusPuzzles.crankInserted = true;
  state.circusPuzzles.crankCollected = true;
  state.circusInventory ||= {};
  const holder = CRANK_KEYS.map(key => state.circusInventory[key]?.holder).find(Boolean) || null;
  for (const key of CRANK_KEYS) {
    state.circusInventory[key] = {
      ...state.circusInventory[key], collected: true, inserted: true, holder
    };
  }
  return true;
}
