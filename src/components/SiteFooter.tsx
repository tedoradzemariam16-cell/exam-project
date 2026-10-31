import { Link } from 'react-router-dom'
import { ExternalLink, Mail, MapPin } from 'lucide-react'
import { SchoolWordmark } from './Logo'

const SCHOOL_SITE = 'https://taoba.edu.ge/ka'
const ADDRESS = 'ბათუმი, რურუას ქუჩა 10'
const MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Batumi, Rurua street 10')}`
const EMAIL = 'schooltaoba@gmail.com'
const MISSION =
  'ჩვენ გვჯერა, რომ მხოლოდ საკუთარი პიროვნების თავისუფლად განვითარება განაპირობებს მოსწავლის ბედნიერებას და წარმატებას, შესაბამისად მზად ვართ ვაქციოთ სწავლა მოსწავლისთვის საინტერესო პროცესად, გარემოში სადაც ყველა მიღებული და დაფასებულია, სადაც მოსწავლე შეძლებს იპოვოს საკუთარი თავი.'

// Brand glyphs are drawn inline (lucide no longer ships brand icons).
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H7.9v3h2.6V21z" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M16.6 3c.3 2.3 1.6 3.8 3.9 4v2.7c-1.4.1-2.6-.3-3.9-1.1v5.6c0 3.6-2.6 6-5.9 5.8-3.4-.2-5.6-3.5-4.6-6.7.7-2.4 3-4 5.6-3.7v2.9c-1.5-.4-3 .6-3.1 2-.2 1.6 1.1 2.8 2.6 2.7 1.3-.1 2.3-1.2 2.3-2.6V3z" />
    </svg>
  )
}

const SOCIAL = [
  { label: 'Facebook', href: 'https://www.facebook.com/skolataoba', Icon: FacebookIcon },
  { label: 'Instagram', href: 'https://www.instagram.com/taoba_school/', Icon: InstagramIcon },
  { label: 'TikTok', href: 'https://www.tiktok.com/@schooltaoba', Icon: TikTokIcon },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <figure className="rounded-2xl border-l-4 border-accent-500 bg-white p-5 shadow-sm sm:p-6">
          <blockquote className="text-[0.95rem] leading-relaxed text-slate-700 italic">„{MISSION}“</blockquote>
          <figcaption className="mt-3 text-sm font-bold text-brand-900">— სკოლა თაობა</figcaption>
        </figure>
      </div>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <a href={SCHOOL_SITE} target="_blank" rel="noopener noreferrer" aria-label="სკოლა თაობა — ოფიციალური საიტი">
            <SchoolWordmark className="h-10" />
          </a>
          <p className="mt-2 text-sm font-extrabold tracking-wide text-accent-600">მეტი ვიდრე სკოლა</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-600">
            „თაობა ქვიზი“ — სკოლა თაობის საგანმანათლებლო პლატფორმა: ინტერაქტიული ქვიზები გაკვეთილზე, ხელოვნური ინტელექტით
            შექმნილი კითხვები და შედეგების ანალიზი მასწავლებლისთვის.
          </p>
        </div>

        <nav aria-label="ბმულები">
          <h2 className="text-sm font-bold text-slate-900">ბმულები</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <Link to="/join" className="hover:text-brand-700 hover:underline">
                თამაშში შესვლა (მოსწავლე)
              </Link>
            </li>
            <li>
              <Link to="/login" className="hover:text-brand-700 hover:underline">
                მასწავლებლის შესვლა
              </Link>
            </li>
            <li>
              <Link to="/register" className="hover:text-brand-700 hover:underline">
                რეგისტრაცია
              </Link>
            </li>
            <li>
              <a href={SCHOOL_SITE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand-700 hover:underline">
                სკოლის საიტი <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-bold text-slate-900">კონტაქტი</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <a href={MAP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 hover:text-brand-700 hover:underline">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {ADDRESS}
              </a>
            </li>
            <li>
              <a href={`mailto:${EMAIL}`} className="inline-flex items-start gap-2 break-all hover:text-brand-700 hover:underline">
                <Mail className="mt-0.5 size-4 shrink-0" aria-hidden /> {EMAIL}
              </a>
            </li>
          </ul>
          <h2 className="mt-6 text-sm font-bold text-slate-900">გამოგვყევით</h2>
          <ul className="mt-3 flex gap-2">
            {SOCIAL.map(({ label, href, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`სკოლა თაობა — ${label}`}
                  title={label}
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500 sm:px-6">© {new Date().getFullYear()} სკოლა თაობა · მეტი ვიდრე სკოლა</p>
      </div>
    </footer>
  )
}
