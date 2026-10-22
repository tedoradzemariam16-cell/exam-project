import { Circle, Diamond, Square, Triangle } from 'lucide-react'
import { OPTION_LETTERS } from '@/lib/format'

// Each option has colour + shape + letter so it never relies on colour alone.
export const ANSWER_STYLES = [
  { bg: 'bg-answer-a', text: 'text-white', ring: 'ring-answer-a', Icon: Triangle, name: 'სამკუთხედი' },
  { bg: 'bg-answer-b', text: 'text-white', ring: 'ring-answer-b', Icon: Diamond, name: 'რომბი' },
  { bg: 'bg-answer-c', text: 'text-slate-950', ring: 'ring-answer-c', Icon: Circle, name: 'წრე' },
  { bg: 'bg-answer-d', text: 'text-white', ring: 'ring-answer-d', Icon: Square, name: 'კვადრატი' },
] as const

export function optionLabel(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1)
}
