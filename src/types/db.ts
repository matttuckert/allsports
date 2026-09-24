import { SportKey } from './scoring';

export interface StandingRow {
  gm_id: string;
  gm_name: string;
  total_points: number;
}

export interface RosterEntryPointsRow {
  roster_entry_id: string;
  gm_id: string;
  gm_name: string;
  sport_key: SportKey;
  name: string;
  round: number;
  total_points: number;
}

export type GameStage = 'regular' | 'quarterfinal' | 'semifinal' | 'championship';
export type GameStatus = 'scheduled' | 'live' | 'final';

export interface RosterGameRow {
  game_id: string;
  sport_key: SportKey;
  season: string;
  stage: GameStage;
  starts_at: string | null;
  status: GameStatus;
  is_standings_result: boolean;
  home_name: string;
  home_score: number | null;
  away_name: string;
  away_score: number | null;
  roster_entry_id: string;
  points: number;
  reason: string;
  gm_id: string;
  gm_name: string;
  rostered_name: string;
}
