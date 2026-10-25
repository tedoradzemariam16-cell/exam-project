import { describe, expect, it } from 'vitest'
import { calculatePoints, DEFAULT_SCORING } from '@/features/game/scoring'
import { estimateClockOffset, questionPhase, remainingMs, type TimerSnapshot } from '@/features/game/clock'

describe('calculatePoints (mirror of the database formula)', () => {
  // Same vectors as tests/db/01_security_and_game.test.sql
  it.each([
    [false, 20000, 20000, 0],
    [true, 20000, 20000, 1500],
    [true, 10000, 20000, 1250],
    [true, 0, 20000, 1000],
    [true, 5000, 20000, 1125],
  ])('correct=%s remaining=%s duration=%s → %s', (correct, remaining, duration, expected) => {
    expect(calculatePoints(correct, remaining, duration)).toBe(expected)
  })

  it('never gives speed points to an incorrect answer', () => {
    expect(calculatePoints(false, 19999, 20000)).toBe(0)
  })

  it('awards more points for earlier correct answers', () => {
    expect(calculatePoints(true, 15000, 20000)).toBeGreaterThan(calculatePoints(true, 5000, 20000))
  })

  it('gives only base points when speed bonus is disabled', () => {
    expect(calculatePoints(true, 20000, 20000, { ...DEFAULT_SCORING, speedBonus: false })).toBe(1000)
  })

  it('clamps out-of-range remaining time', () => {
    expect(calculatePoints(true, 99999, 20000)).toBe(1500)
    expect(calculatePoints(true, -5, 20000)).toBe(1000)
  })
})

describe('authoritative timer (client view)', () => {
  const ends = '2026-10-21T12:00:20.000Z'
  const endsMs = Date.parse(ends)
  const active: TimerSnapshot = { status: 'active', question_ends_at: ends, paused_remaining_ms: null }

  it('computes remaining time from the server deadline and clock offset', () => {
    // Local clock is 2 s behind the server: offset = +2000.
    expect(remainingMs(active, endsMs - 12000, 2000)).toBe(10000)
  })

  it('stays open for the full duration — it does not depend on how many students answered', () => {
    expect(questionPhase(active, endsMs - 1, 0)).toBe('open')
    expect(questionPhase(active, endsMs, 0)).toBe('revealed')
  })

  it('a fast local clock cannot extend the question (it only shows less time)', () => {
    expect(remainingMs(active, endsMs - 5000, 10000)).toBe(0)
  })

  it('shows the frozen remaining time while paused', () => {
    const paused: TimerSnapshot = { ...active, paused_remaining_ms: 7300 }
    expect(remainingMs(paused, endsMs + 60000, 0)).toBe(7300)
    expect(questionPhase(paused, endsMs + 60000, 0)).toBe('paused')
  })

  it('reports lobby and finished states', () => {
    expect(questionPhase({ status: 'lobby', question_ends_at: null, paused_remaining_ms: null }, 0, 0)).toBe('idle')
    expect(questionPhase({ ...active, status: 'finished' }, 0, 0)).toBe('finished')
    expect(remainingMs({ ...active, status: 'finished' }, endsMs - 5000, 0)).toBe(0)
  })

  it('estimates clock offset using the request midpoint', () => {
    // Request sent at local 1000, received at 1200 → midpoint 1100; server said 5100.
    expect(estimateClockOffset(new Date(5100).toISOString(), 1000, 1200)).toBe(4000)
    expect(estimateClockOffset('not a date', 0, 0)).toBe(0)
  })
})

describe('speed-bonus choices in the quiz editor', () => {
  it('offers "none", 100, 250, 500 and 1000', async () => {
    const { SPEED_BONUS_OPTIONS } = await import('@/features/quiz/model')
    expect(SPEED_BONUS_OPTIONS).toEqual([0, 100, 250, 500, 1000])
  })

  it('"none" switches the bonus off; other values switch it on', async () => {
    const { speedBonusPatch, speedBonusValue } = await import('@/features/quiz/model')
    expect(speedBonusPatch(0)).toEqual({ speedBonus: false, maxSpeedBonus: 0 })
    expect(speedBonusPatch(100)).toEqual({ speedBonus: true, maxSpeedBonus: 100 })
    expect(speedBonusValue({ speedBonus: false, maxSpeedBonus: 500 })).toBe(0)
    expect(speedBonusValue({ speedBonus: true, maxSpeedBonus: 250 })).toBe(250)
  })

  it('a 100-point bonus adds at most 100; no bonus gives only base points', () => {
    const rules100 = { speedBonus: true, basePoints: 1000, maxSpeedBonus: 100 }
    expect(calculatePoints(true, 20000, 20000, rules100)).toBe(1100)
    expect(calculatePoints(true, 10000, 20000, rules100)).toBe(1050)
    expect(calculatePoints(true, 0, 20000, rules100)).toBe(1000)
    const none = { speedBonus: false, basePoints: 1000, maxSpeedBonus: 0 }
    expect(calculatePoints(true, 20000, 20000, none)).toBe(1000)
    expect(calculatePoints(true, 1, 20000, none)).toBe(1000)
    expect(calculatePoints(false, 20000, 20000, none)).toBe(0)
  })
})
