import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QuestionCard } from '@/features/quiz/QuestionCard'
import { emptyQuestion, validateQuestion, type DraftQuestion } from '@/features/quiz/model'
import { Countdown } from '@/features/game/Countdown'

// ---- Auth guard -------------------------------------------------------------
const authState = { loading: false, session: null as unknown, profile: null as unknown, signOut: vi.fn() }
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => authState }))

describe('RequireTeacher', () => {
  const renderAt = async () => {
    const { RequireTeacher } = await import('@/features/auth/RequireTeacher')
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/login" element={<p>შესვლის გვერდი</p>} />
          <Route path="/app" element={<RequireTeacher><p>მასწავლებლის დაფა</p></RequireTeacher>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('redirects signed-out visitors to login', async () => {
    authState.session = null
    authState.profile = null
    await renderAt()
    expect(screen.getByText('შესვლის გვერდი')).toBeInTheDocument()
    expect(screen.queryByText('მასწავლებლის დაფა')).not.toBeInTheDocument()
  })

  it('blocks signed-in users without a teacher profile (e.g. anonymous students)', async () => {
    authState.session = { user: { id: 'x', is_anonymous: true } }
    authState.profile = null
    await renderAt()
    expect(screen.getByText('მასწავლებლის პროფილი ვერ მოიძებნა')).toBeInTheDocument()
    expect(screen.queryByText('მასწავლებლის დაფა')).not.toBeInTheDocument()
  })

  it('lets teachers in', async () => {
    authState.session = { user: { id: 't' } }
    authState.profile = { id: 't', full_name: 'ნინო' }
    await renderAt()
    expect(screen.getByText('მასწავლებლის დაფა')).toBeInTheDocument()
  })
})

// ---- Question editor ----------------------------------------------------------
function renderCard(q: DraftQuestion, onChange = vi.fn()) {
  render(
    <QuestionCard
      index={0}
      total={1}
      question={q}
      objectives={['მიზანი']}
      defaultTime={20}
      issues={validateQuestion(q)}
      showIssues
      aiAvailable
      regenerating={false}
      onChange={onChange}
      onMove={vi.fn()}
      onDelete={vi.fn()}
      onRegenerate={vi.fn()}
    />,
  )
  return onChange
}

describe('QuestionCard', () => {
  it('shows Georgian validation errors for an incomplete question', () => {
    renderCard(emptyQuestion())
    expect(screen.getByText('კითხვის ტექსტი სავალდებულოა')).toBeInTheDocument()
    expect(screen.getByText('საჭიროებს შესწორებას')).toBeInTheDocument()
  })

  it('has four labelled answer inputs and a single correct-answer radio group', async () => {
    const q: DraftQuestion = { ...emptyQuestion(), text: 'Q', options: ['1', '2', '3', '4'], source: 'ai' }
    const onChange = renderCard(q)
    expect(screen.getByLabelText('პასუხი ა')).toHaveValue('1')
    expect(screen.getByLabelText('პასუხი დ')).toHaveValue('4')
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(4)
    expect(radios[0]).toBeChecked()
    await userEvent.click(radios[2])
    // Editing an AI question marks it as reviewed/edited.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ correctIndex: 2, source: 'ai_edited' }))
    expect(screen.getByText('AI — გადასახედი')).toBeInTheDocument()
  })
})

describe('Countdown', () => {
  it('exposes the remaining seconds to assistive technology', () => {
    render(<Countdown remaining={7200} total={20000} />)
    expect(screen.getByRole('timer')).toHaveAccessibleName('დარჩა 8 წამი')
  })
  it('announces the paused state', () => {
    render(<Countdown remaining={5000} total={20000} paused />)
    expect(screen.getByRole('timer')).toHaveAccessibleName('შეჩერებულია, დარჩა 5 წამი')
  })
})
