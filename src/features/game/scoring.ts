// Mirror of public.calculate_points() in the database. The database is the
// source of truth; this copy is used only for previews/explanations in the UI
// and to keep the formula covered by unit tests.

export interface ScoringRules {
  speedBonus: boolean
  basePoints: number
  maxSpeedBonus: number
}

export const DEFAULT_SCORING: ScoringRules = { speedBonus: true, basePoints: 1000, maxSpeedBonus: 500 }

export function calculatePoints(
  correct: boolean,
  remainingMs: number,
  durationMs: number,
  rules: ScoringRules = DEFAULT_SCORING,
): number {
  if (!correct) return 0
  if (!rules.speedBonus || durationMs <= 0) return rules.basePoints
  const ratio = Math.min(1, Math.max(0, remainingMs / durationMs))
  return rules.basePoints + Math.round(rules.maxSpeedBonus * ratio)
}
