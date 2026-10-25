// Translate error codes from the database, Edge Function and network into Georgian.

const MESSAGES: Record<string, string> = {
  // quiz
  QUIZ_NOT_FOUND: 'ქვიზი ვერ მოიძებნა ან მასზე წვდომა არ გაქვთ.',
  QUIZ_NOT_PUBLISHED: 'თამაშის დასაწყებად ქვიზი ჯერ უნდა გამოაქვეყნოთ.',
  QUIZ_HAS_NO_QUESTIONS: 'ქვიზს ჯერ არ აქვს კითხვები.',
  QUIZ_HAS_INVALID_QUESTIONS: 'ზოგიერთ კითხვას არ აქვს ოთხი პასუხი ან ზუსტად ერთი სწორი პასუხი.',
  QUESTION_TEXT_REQUIRED: 'ყველა კითხვას უნდა ჰქონდეს ტექსტი.',
  QUESTION_NEEDS_FOUR_OPTIONS: 'თითოეულ კითხვას ზუსტად ოთხი პასუხი უნდა ჰქონდეს.',
  QUESTION_NEEDS_ONE_CORRECT: 'თითოეულ კითხვას ზუსტად ერთი სწორი პასუხი უნდა ჰქონდეს.',
  OPTION_TEXT_REQUIRED: 'პასუხის ველები არ უნდა იყოს ცარიელი.',
  OPTIONS_MUST_DIFFER: 'ერთი კითხვის პასუხები ერთმანეთისგან უნდა განსხვავდებოდეს.',
  TOO_MANY_QUESTIONS: 'ქვიზში მაქსიმუმ 30 კითხვაა დასაშვები.',
  TOO_MANY_OBJECTIVES: 'მაქსიმუმ 10 სასწავლო მიზანია დასაშვები.',
  INVALID_INPUT: 'მონაცემები არასწორი ფორმატითაა.',
  NOT_TEACHER: 'ეს მოქმედება მხოლოდ მასწავლებლისთვისაა.',
  // sessions
  TOO_MANY_OPEN_SESSIONS: 'ერთდროულად მაქსიმუმ 3 ღია თამაშის ქონაა შესაძლებელი. ჯერ დაასრულეთ ერთ-ერთი.',
  CODE_GENERATION_FAILED: 'თამაშის კოდის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.',
  SESSION_NOT_FOUND: 'თამაში ამ კოდით ვერ მოიძებნა ან უკვე დასრულებულია.',
  INVALID_STATE: 'ეს მოქმედება თამაშის ამ ეტაპზე შეუძლებელია.',
  NO_PARTICIPANTS: 'თამაშის დასაწყებად საჭიროა მინიმუმ ერთი მონაწილე.',
  QUESTION_STILL_ACTIVE: 'კითხვის დრო ჯერ არ ამოწურულა. შემდეგ კითხვაზე გადასვლა მხოლოდ ტაიმერის დასრულების შემდეგაა შესაძლებელი.',
  GAME_PAUSED: 'თამაში შეჩერებულია.',
  CANNOT_PAUSE: 'შეჩერება მხოლოდ აქტიური კითხვის დროსაა შესაძლებელი.',
  CANNOT_RESUME: 'თამაში შეჩერებული არ არის.',
  // students
  NOT_AUTHENTICATED: 'სესია ვერ შეიქმნა. განაახლეთ გვერდი და სცადეთ თავიდან.',
  RATE_LIMITED: 'ძალიან ბევრი მცდელობა. დაელოდეთ ერთ წუთს და სცადეთ თავიდან.',
  INVALID_CODE: 'თამაშის კოდი უნდა შედგებოდეს 6 ციფრისგან.',
  INVALID_NAME: 'შეიყვანეთ სახელი და გვარი (თითოეული მაქსიმუმ 50 სიმბოლო).',
  SESSION_FULL: 'თამაშში მონაწილეთა მაქსიმალური რაოდენობა შევსებულია.',
  NOT_A_PARTICIPANT: 'თქვენ ამ თამაშის მონაწილე არ ხართ. შედით თამაშის კოდით.',
  QUESTION_NOT_ACTIVE: 'ეს კითხვა აღარ არის აქტიური.',
  TOO_LATE: 'დრო ამოიწურა — პასუხი ვეღარ მიიღება.',
  INVALID_OPTION: 'არასწორი პასუხის ვარიანტი.',
  ALREADY_ANSWERED: 'ამ კითხვაზე უკვე უპასუხეთ.',
  // AI
  NOT_CONFIGURED: 'AI გენერაცია ჯერ არ არის კონფიგურირებული (Gemini API გასაღები არ არის დაყენებული). შეგიძლიათ კითხვები ხელით შექმნათ.',
  RATE_LIMITED_AI: 'Gemini-ის წუთობრივი ლიმიტი ამოიწურა. დაელოდეთ დაახლოებით ერთ წუთს და სცადეთ თავიდან.',
  QUOTA_EXHAUSTED: 'Gemini-ის უფასო დღიური ლიმიტი ამოიწურა. სცადეთ ხვალ ან შექმენით კითხვები ხელით.',
  TEACHER_LIMIT_REACHED: 'AI გენერაციის თქვენი ლიმიტი ამოიწურა (საათში/დღეში). სცადეთ მოგვიანებით ან დაამატეთ კითხვები ხელით.',
  MODEL_UNAVAILABLE: 'AI მოდელი დროებით მიუწვდომელია. სცადეთ რამდენიმე წუთში.',
  INVALID_API_KEY: 'Gemini API გასაღები არასწორია. შეამოწმეთ Supabase-ის საიდუმლო პარამეტრები.',
  SAFETY_BLOCKED: 'AI-მ მოთხოვნა უსაფრთხოების წესების გამო დაბლოკა. შეცვალეთ მასალა ან ფორმულირება.',
  INVALID_OUTPUT: 'AI-მ არასწორი ფორმატის პასუხი დააბრუნა. სცადეთ თავიდან.',
  INVALID_REQUEST: 'მოთხოვნა არასრულია. შეავსეთ საგანი, კლასი, თემა და სასწავლო მიზანი.',
  REQUEST_TOO_LARGE: 'სასწავლო მასალა ძალიან დიდია.',
  UNAUTHORIZED: 'სესია ამოიწურა. გთხოვთ, თავიდან შეხვიდეთ სისტემაში.',
  NETWORK: 'ქსელთან დაკავშირება ვერ მოხერხდა. შეამოწმეთ ინტერნეტი და სცადეთ თავიდან.',
  AI_UNREACHABLE:
    'AI ფუნქციასთან დაკავშირება ვერ მოხერხდა. შეამოწმეთ, რომ Supabase-ში Edge Function „generate-questions“ გაშვებულია და მასზე „Verify JWT“ გამორთულია.',
  INTERNAL: 'AI ფუნქციაში მოულოდნელი შეცდომა მოხდა. სცადეთ თავიდან; თუ განმეორდა, ნახეთ ფუნქციის Logs Supabase-ში.',
  // auth (Supabase messages)
  'Invalid login credentials': 'ელფოსტა ან პაროლი არასწორია.',
  'Email not confirmed': 'ელფოსტა ჯერ არ არის დადასტურებული. შეამოწმეთ შემოსული წერილები.',
  'User already registered': 'ამ ელფოსტით ანგარიში უკვე არსებობს.',
  'Anonymous sign-ins are disabled':
    'სტუდენტების ანონიმური შესვლა გამორთულია. მასწავლებელმა Supabase-ში უნდა ჩართოს „Anonymous sign-ins“.',
}

const KNOWN_CODES = Object.keys(MESSAGES)

/** Return a Georgian message for any thrown value. Never exposes raw internals. */
export function toGeorgianMessage(err: unknown, fallback = 'დაფიქსირდა შეცდომა. სცადეთ თავიდან.'): string {
  if (!err) return fallback
  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : ''
  if (MESSAGES[raw]) return MESSAGES[raw]
  const code = KNOWN_CODES.find((c) => raw.includes(c))
  if (code) return MESSAGES[code]
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return MESSAGES.NETWORK
  if (/password should be at least/i.test(raw)) return 'პაროლი უნდა შედგებოდეს მინიმუმ 8 სიმბოლოსგან.'
  if (/rate limit|too many requests/i.test(raw)) return 'ძალიან ბევრი მოთხოვნა. სცადეთ ცოტა ხანში.'
  if (/jwt|token/i.test(raw)) return MESSAGES.UNAUTHORIZED
  return fallback
}

export function messageForCode(code: string): string | undefined {
  return MESSAGES[code]
}
