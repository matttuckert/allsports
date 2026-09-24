export type SportKey =
  | 'NFL'
  | 'NBA'
  | 'MLB'
  | 'NHL'
  | 'EPL'
  | 'WNBA'
  | 'CFB'
  | 'PGA'
  | 'UFA'
  | 'TENNIS';

/**
 * Points a drafted team/player accrues toward a fantasy roster's season total.
 * `regularSeasonDescription` is kept as free text because the earning formula
 * differs by sport (per-win, per-win+draw, per-win+OTL, or per-event for golf/tennis).
 */
export interface SportScoringRule {
  sport: SportKey;
  label: string;
  regularSeasonDescription: string;
  /** Structured regular-season win/draw/OTL values, for the sports the ingest job scores automatically. */
  pointsPerWin?: number;
  pointsPerDraw?: number;
  pointsPerOvertimeLoss?: number;
  /** Tennis only: one-time bonus for winning an entire Grand Slam, on top of the championship placement bonus. */
  slamWinBonus?: number;
  championshipPoints: number;
  semifinalPoints?: number;
  quarterfinalPoints?: number;
  priorSeasonChampionPoints: number;
  priorSeasonMiddlePoints: number;
  priorSeasonLastPoints: number;
}
