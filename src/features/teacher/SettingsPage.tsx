import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KeyRound, ShieldAlert, UserRound } from 'lucide-react'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { deleteFinishedSessions } from '@/features/game/api'
import { supabase } from '@/lib/supabase'
import { toGeorgianMessage } from '@/lib/errors'

export function SettingsPage() {
  const { profile, session, refreshProfile } = useAuth()
  const toast = useToast()
  const [params] = useSearchParams()
  const recovery = params.get('recovery') === '1'

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [school, setSchool] = useState(profile?.school ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [savingPw, setSavingPw] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setSavingProfile(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim().slice(0, 120), school: school.trim().slice(0, 160) })
      .eq('id', profile.id)
    setSavingProfile(false)
    if (error) toast.error(toGeorgianMessage(error))
    else {
      toast.success('პროფილი განახლდა.')
      await refreshProfile()
    }
  }

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setPwError('პაროლი უნდა შედგებოდეს მინიმუმ 8 სიმბოლოსგან')
    if (password !== confirm) return setPwError('პაროლები არ ემთხვევა')
    setPwError(null)
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSavingPw(false)
    if (error) setPwError(toGeorgianMessage(error))
    else {
      setPassword('')
      setConfirm('')
      toast.success('პაროლი შეიცვალა.')
    }
  }

  const clearSessions = async () => {
    setClearing(true)
    try {
      const n = await deleteFinishedSessions()
      toast.success(`წაიშალა ${n} დასრულებული სესია.`)
    } catch (e) {
      toast.error(toGeorgianMessage(e))
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }

  return (
    <>
      <PageHeader title="ანგარიშის პარამეტრები" />
      <div className="grid max-w-3xl gap-6">
        {recovery && (
          <Alert tone="info" title="პაროლის აღდგენა">
            დააყენეთ ახალი პაროლი ქვემოთ მოცემულ ფორმაში.
          </Alert>
        )}

        <Card>
          <CardHeader icon={<UserRound className="size-5" />} title="პროფილი" description={session?.user.email} />
          <CardBody>
            <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
              <Field label="სახელი და გვარი">
                <Input value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label="სკოლა">
                <Input value={school} maxLength={160} onChange={(e) => setSchool(e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" loading={savingProfile}>შენახვა</Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<KeyRound className="size-5" />} title="პაროლის შეცვლა" />
          <CardBody>
            <form onSubmit={savePassword} className="grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="ახალი პაროლი" hint="მინიმუმ 8 სიმბოლო" error={pwError}>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label="გაიმეორეთ პაროლი">
                <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" loading={savingPw}>პაროლის შეცვლა</Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card className="border-red-200">
          <CardHeader icon={<ShieldAlert className="size-5 text-red-700" />} title="მონაცემების მართვა" />
          <CardBody className="space-y-4 text-sm text-slate-700">
            <p>
              მოსწავლეების შესახებ ინახება მხოლოდ სახელი, გვარი და თამაშის პასუხები. სატესტო ან ძველი სესიების წაშლით
              სამუდამოდ იშლება მათი მონაწილეები და პასუხებიც.
            </p>
            <Button variant="danger" onClick={() => setConfirmClear(true)}>ყველა დასრულებული სესიის წაშლა</Button>
            <p className="text-xs text-slate-500">
              მთლიანი ანგარიშის წასაშლელად მიმართეთ პლატფორმის ადმინისტრატორს (Supabase → Authentication → Users). ანგარიშის
              წაშლისას ავტომატურად იშლება ყველა ქვიზი და სესია.
            </p>
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearSessions()}
        title="დასრულებული სესიების წაშლა"
        description="სამუდამოდ წაიშლება ყველა დასრულებული სესია, მათი მონაწილეები და პასუხები. მოქმედება შეუქცევადია."
        confirmLabel="წაშლა"
        danger
        loading={clearing}
      />
    </>
  )
}
