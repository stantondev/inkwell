import type { ProfileHome } from "./profile-home";

/**
 * The Arrange editor's page and its Undo/Redo, as one reducer so every
 * change is a single, pure state update (setting history from inside another
 * state update ran twice under React's development checks).
 */
export interface HistoryState {
  home: ProfileHome;
  past: ProfileHome[];
  future: ProfileHome[];
}

export type HistoryAction =
  /** A change worth undoing. `before` is the page it should undo to, for changes previewed live first. */
  | { type: "commit"; next: ProfileHome; before?: ProfileHome }
  /** A live preview (dragging a column edge, typing in a note): shown, not yet a step. */
  | { type: "preview"; home: ProfileHome }
  | { type: "undo" }
  | { type: "redo" }
  /** The server's cleaned copy after saving; history stays. */
  | { type: "replace"; home: ProfileHome };

const LIMIT = 50;

const same = (a: ProfileHome, b: ProfileHome) => JSON.stringify(a) === JSON.stringify(b);

export function initHistory(home: ProfileHome): HistoryState {
  return { home, past: [], future: [] };
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "commit": {
      const before = action.before ?? state.home;
      if (same(before, action.next)) return { ...state, home: action.next };
      return { home: action.next, past: [...state.past, before].slice(-LIMIT), future: [] };
    }
    case "preview":
      return { ...state, home: action.home };
    case "undo": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return { home: prev, past: state.past.slice(0, -1), future: [state.home, ...state.future].slice(0, LIMIT) };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { home: next, past: [...state.past, state.home].slice(-LIMIT), future: rest };
    }
    case "replace":
      return { ...state, home: action.home };
  }
}
