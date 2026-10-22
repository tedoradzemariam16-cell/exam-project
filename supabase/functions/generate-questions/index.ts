// Supabase Edge Function: generate quiz questions with Google Gemini.
//
// Security:
//  * GEMINI_API_KEY lives only in Supabase secrets (never in the browser).
//  * The caller must be a signed-in teacher (has a row in public.profiles).
//  * Per-teacher rate limits are enforced through public.ai_generation_log.
//  * Nothing is persisted here: questions are returned for teacher review
//    and only saved when the teacher explicitly saves the quiz.
//  * Request bodies and model output are never logged.
import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import {
  generationRequestSchema,
  geminiResponseJsonSchema,
  parseGeneratedQuestions,
  type ParseResult,
} from '../_shared/questionSchema.ts'
import { buildSystemInstruction, buildUserPrompt } from '../_shared/prompt.ts'
import { classifyAiError, type AiErrorCode } from '../_shared/aiErrors.ts'

const PER_HOUR_LIMIT = Number(Deno.env.get('AI_LIMIT_PER_HOUR') ?? '20')
const PER_DAY_LIMIT = Number(Deno.env.get('AI_LIMIT_PER_DAY') ?? '60')
const PRIMARY_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest'
const FALLBACK_MODEL = Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-flash-lite-latest'
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim())
const MAX_BODY_BYTES = 200_000
const TIMEOUT_MS = 55_000

function corsHeaders(origin: string | null): HeadersInit {
  const allow = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function fail(code: AiErrorCode | string, status: number, origin: string | null, extra: Record<string, unknown> = {}) {
  return json({ error: code, ...extra }, status, origin)
}

async function generateWith(ai: GoogleGenAI, model: string, system: string, prompt: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: geminiResponseJsonSchema,
        temperature: 0.6,
        abortSignal: controller.signal,
      },
    })
    const text = response.text
    if (!text) {
      const reason = response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason
      throw new Error(reason && /SAFETY|BLOCK/i.test(String(reason)) ? 'blocked by safety' : 'EMPTY_RESPONSE')
    }
    return text
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405, origin)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return fail('NOT_CONFIGURED', 503, origin)

  // ---- Authenticate the teacher -------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return fail('UNAUTHORIZED', 401, origin)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.slice(7))
  if (userError || !userData.user || userData.user.is_anonymous) return fail('UNAUTHORIZED', 401, origin)
  const userId = userData.user.id

  const { data: profile } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (!profile) return fail('UNAUTHORIZED', 403, origin)

  // ---- Validate input -------------------------------------------------------
  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) return fail('REQUEST_TOO_LARGE', 413, origin)
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return fail('INVALID_REQUEST', 400, origin)
  }
  const parsed = generationRequestSchema.safeParse(body)
  if (!parsed.success) {
    return fail('INVALID_REQUEST', 400, origin, {
      fields: parsed.error.issues.map((i) => i.path.join('.')),
    })
  }
  const input = parsed.data

  // ---- Per-teacher rate limit ---------------------------------------------
  const since = (ms: number) => new Date(Date.now() - ms).toISOString()
  const [{ count: lastHour }, { count: lastDay }] = await Promise.all([
    supabase.from('ai_generation_log').select('id', { count: 'exact', head: true }).gte('created_at', since(3_600_000)),
    supabase.from('ai_generation_log').select('id', { count: 'exact', head: true }).gte('created_at', since(86_400_000)),
  ])
  if ((lastHour ?? 0) >= PER_HOUR_LIMIT || (lastDay ?? 0) >= PER_DAY_LIMIT) {
    return fail('TEACHER_LIMIT_REACHED', 429, origin, { perHour: PER_HOUR_LIMIT, perDay: PER_DAY_LIMIT })
  }
  const { error: logError } = await supabase.from('ai_generation_log').insert({ teacher_id: userId, kind: input.mode })
  if (logError) return fail('UNAUTHORIZED', 403, origin)

  // ---- Call Gemini (primary model, then one fallback) -----------------------
  const ai = new GoogleGenAI({ apiKey })
  const system = buildSystemInstruction()
  const { prompt, truncated } = buildUserPrompt(input)
  const wanted = input.mode === 'single' ? 1 : input.questionCount
  const models = PRIMARY_MODEL === FALLBACK_MODEL ? [PRIMARY_MODEL] : [PRIMARY_MODEL, FALLBACK_MODEL]

  let lastCode: AiErrorCode = 'UNKNOWN'
  let lastStatus = 500
  for (const model of models) {
    try {
      const text = await generateWith(ai, model, system, prompt)
      const result: ParseResult = parseGeneratedQuestions(text, {
        maxQuestions: wanted,
        objectiveCount: input.learningObjectives.length,
        existingQuestions: input.existingQuestions,
      })
      return json(
        {
          questions: result.questions,
          requested: wanted,
          rejected: result.rejected,
          materialTruncated: truncated,
          model,
        },
        200,
        origin,
      )
    } catch (err) {
      const c = classifyAiError(err)
      lastCode = c.code
      lastStatus = c.httpStatus
      // Log only the classification, never the prompt or teacher material.
      console.error(`generate-questions: model=${model} code=${c.code}`)
      if (!c.tryFallback) break
    }
  }
  return fail(lastCode, lastStatus, origin)
})
