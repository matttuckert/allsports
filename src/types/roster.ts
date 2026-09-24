import { SportKey } from './scoring';

export interface RosterEntry {
  /** Draft round this pick was made in (R1-R10). Order varies per GM. */
  round: number;
  sport: SportKey;
  /** Team or player name exactly as drafted. */
  name: string;
}

export interface GmRoster {
  gm: string;
  picks: RosterEntry[];
}
