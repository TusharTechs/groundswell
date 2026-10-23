// Inputs and outputs of the spatial word-of-mouth model.

export interface Grid {
  /** Relative population (or activity) of each cell; any positive scale. */
  mass: ArrayLike<number>;
  /** How well the launch fits each cell's taste, 0–1. */
  fit: ArrayLike<number>;
  /**
   * Optional per-cell multiplier on the natural audience, 0–1: for an event,
   * how likely people in the cell are to travel to the venue.
   */
  potential?: ArrayLike<number>;
  /** Adjacent cells of each cell. */
  geo: number[][];
  /** Distant cells with similar taste, as [index, similarity 0–1]. */
  ties: [number, number][][];
}

/** One way an action raises awareness: in particular cells, or across the city weighted per cell. */
export type Effect =
  | {
      kind: "local";
      /** Cells reached and how strongly (1 = the action's full rate). */
      cells: { index: number; weight: number }[];
      /** Daily chance a potential adopter in a fully weighted cell discovers the launch through this action. */
      rate: number;
      /** First and last day (inclusive, 0-based) the effect runs. */
      from: number;
      to: number;
    }
  | {
      kind: "broadcast";
      /** Per-cell weight, 0–1 (for example how much the cell's taste matches a podcast's listeners). */
      weights: ArrayLike<number>;
      rate: number;
      from: number;
      to: number;
    };

export interface Action {
  id: string;
  label: string;
  /** Cost in the plan's currency. */
  cost: number;
  effects: Effect[];
}

export interface Params {
  /** Days from the start of the campaign to launch day. */
  days: number;
  /** Synthetic residents spread over the grid by mass. */
  population: number;
  /** Share of a perfectly fitting cell's residents who could ever adopt. */
  audienceShare: number;
  /** Natural audience in a cell is population × audienceShare × fit^fitExponent. */
  fitExponent: number;
  /** Daily chance of discovering the launch with no promotion at all. */
  baseRate: number;
  /** Word-of-mouth rate: daily hazard when a cell's whole social neighbourhood has adopted (Bass q). */
  wom: number;
  /**
   * Complex contagion: word-of-mouth hazard grows with exposure^womExponent.
   * Above 1, cultural adoption needs reinforcement from several people around
   * you, so dense local clusters spread far better than thin awareness
   * everywhere (Centola & Macy 2007; Centola 2010). 1 is the plain Bass model.
   */
  womExponent: number;
  /**
   * People talk about a launch when they first take it up, then move on: each
   * day's new adopters keep talking with this half-life (days). Exposure counts
   * this fading buzz, not everyone who ever adopted.
   */
  buzzHalfLife: number;
  /** Weights of a cell's own adopters, its adjacent cells' and its long ties' in its social neighbourhood. */
  selfWeight: number;
  geoWeight: number;
  tieWeight: number;
  /** Monte Carlo runs; 0 runs the deterministic expected-value model once. */
  runs: number;
  seed: number;
  /** Days to snapshot per-cell adoption for animation. */
  frameDays?: number[];
}

export const DEFAULT_PARAMS: Params = {
  days: 42,
  population: 250_000,
  audienceShare: 0.25,
  fitExponent: 3,
  baseRate: 0.0004,
  wom: 0.4,
  womExponent: 1.5,
  buzzHalfLife: 6,
  selfWeight: 1,
  geoWeight: 0.6,
  tieWeight: 0.35,
  runs: 48,
  seed: 1,
};

export interface Band {
  mean: number;
  p10: number;
  p90: number;
}

export interface SimResult {
  days: number;
  /** Total natural audience: residents who could ever adopt. */
  naturalAudience: number;
  /** Cumulative adopters at the end of each day. */
  curve: { mean: number[]; p10: number[]; p90: number[] };
  /** Adopters on launch day. */
  adopters: Band;
  /** Adopters on launch day as a share of the natural audience. */
  reach: Band;
  /** Mean adopters per cell on launch day. */
  byCell: Float64Array;
  /** Natural audience per cell. */
  audienceByCell: Float64Array;
  /** Mean adopters per cell on each requested frame day. */
  frames: { day: number; cells: Float64Array }[];
  /** Mean adopters credited to each action, to word of mouth, and to unprompted discovery. */
  attribution: { actions: Record<string, number>; wordOfMouth: number; organic: number };
  /** Cells where at least 10% of the natural audience adopted (mean). */
  cellsReached: number;
  cost: number;
}
