import { SportKey } from '@/types/scoring';

export const colors = {
  primary: '#DC2626',
  primaryDark: '#991B1B',
  background: '#F5F5F5',
  card: '#FFFFFF',
  border: '#E5E5E5',
  text: '#111827',
  textMuted: '#6B7280',
  chip: '#F0F0F0',
  gold: '#FBBF24',
  silver: '#CBD5E1',
  bronze: '#FB923C',
};

export const sportTheme: Record<SportKey, { color: string; emoji: string }> = {
  NFL: { color: '#16A34A', emoji: '🏈' },
  NBA: { color: '#EA580C', emoji: '🏀' },
  MLB: { color: '#2563EB', emoji: '⚾' },
  NHL: { color: '#0891B2', emoji: '🏒' },
  EPL: { color: '#7C3AED', emoji: '⚽' },
  WNBA: { color: '#DB2777', emoji: '🏀' },
  CFB: { color: '#B45309', emoji: '🎓' },
  PGA: { color: '#15803D', emoji: '⛳' },
  UFA: { color: '#0D9488', emoji: '🥏' },
  TENNIS: { color: '#CA8A04', emoji: '🎾' },
};

const FALLBACK = { color: colors.primary, emoji: '🏅' };

export function getSportTheme(key: string) {
  return sportTheme[key as SportKey] ?? FALLBACK;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_COLORS = [colors.gold, colors.silver, colors.bronze];

export function rankBadge(index: number) {
  return {
    label: MEDALS[index] ?? String(index + 1),
    accent: MEDAL_COLORS[index] ?? colors.border,
    isMedal: index < MEDALS.length,
  };
}
