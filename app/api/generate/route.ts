import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'
import { getR2Text } from '@/lib/r2'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type GenerateType =
  | 'lecture_title'
  | 'lecture_synopsis'
  | 'course_synopsis'
  | 'entities'
  | 'entity_desc'
  | 'summary_pdf'

const ENTITY_TYPES = [
  'directors','films','writers','books',
  'painters','paintings','philosophers','themes',
] as const

const JOIN_TABLES: Record<string, { join: string; fk: string; name: string }> = {
  directors:    { join: 'lecture_directors',    fk: 'director_id',   name: 'name'  },
  films:        { join: 'lecture_films',        fk: 'film_id',       name: 'title' },
  writers:      { join: 'lecture_writers',      fk: 'writer_id',     name: 'name'  },
  books:        { join: 'lecture_books',        fk: 'book_id',       name: 'title' },
  painters:     { join: 'lecture_painters',     fk: 'painter_id',    name: 'name'  },
  paintings:    { join: 'lecture_paintings',    fk: 'painting_id',   name: 'title' },
  philosophers: { join: 'lecture_philosophers', fk: 'philosopher_id',name: 'name'  },
  themes:       { join: 'lecture_themes',       fk: 'theme_id',      name: 'name'  },
}

// ---------------------------------------------------------------------------
// Prompts (inline — keep in sync with Transcriber/prompts/)
// ---------------------------------------------------------------------------
const TITLE_SYNOPSIS_PROMPT = `Extract the title and synopsis from this Hebrew lecture transcript.

TITLE format: "Main Subject: Specific Focus" in Hebrew
SYNOPSIS: 1-2 sentences in Hebrew summarising the lecture content.

Return exactly:
TITLE: <title>
SYNOPSIS: <synopsis>

Transcript:
{transcript}`

const COURSE_SYNOPSIS_PROMPT = `Based on these lecture summaries from the course "{title}", write a 3-4 sentence course description in Hebrew that captures the overall themes and scope of the course.

{lectures}

Return only the course description, no labels or prefixes.`

const ENTITIES_ALL_PROMPT = `Extract ALL entities mentioned in this Hebrew lecture transcript.
Return a JSON object with exactly the following structure — no extra keys, no markdown fences.

Rules per category:
- directors:    Film directors explicitly named (English names only, not writers/philosophers)
- films:        Film titles explicitly mentioned (English titles only, real films)
- writers:      Literary authors/novelists/poets/playwrights explicitly named (English)
- books:        Book/literary work titles explicitly mentioned (English or Hebrew)
- painters:     Visual artists (painters, sculptors) explicitly named (English or Hebrew)
- paintings:    Specific artwork titles explicitly mentioned (Hebrew preferred)
- philosophers: Philosophers and major intellectual figures explicitly named (English)
- themes:       Exactly 10 broad academic/philosophical themes from the lecture (Hebrew)

For each category use two lists:
  "discussed" — main subjects of the lecture
  "mentioned" — referenced briefly or in passing

CRITICAL: Only include entities EXPLICITLY NAMED in the transcript. No guessing or inference.
Names may appear in Hebrew transliteration — output in the standard English form.

Return ONLY valid JSON, nothing else:
{"directors":{"discussed":[],"mentioned":[]},"films":{"discussed":[],"mentioned":[]},"writers":{"discussed":[],"mentioned":[]},"books":{"discussed":[],"mentioned":[]},"painters":{"discussed":[],"mentioned":[]},"paintings":{"discussed":[],"mentioned":[]},"philosophers":{"discussed":[],"mentioned":[]},"themes":{"discussed":[],"mentioned":[]}}

Transcript:
{transcript}`

const ENTITY_DESC_PROMPTS: Record<string, string> = {
  directors:   'כתוב 2-3 משפטים בעברית על הבמאי/הבמאית {display}. תאר את סגנון הבימוי, הנושאים המרכזיים ביצירתו/ה, ומה הופך אותו/ה לדמות משמעותית בקולנוע.',
  writers:     'כתוב 2-3 משפטים בעברית על הסופר/הסופרת {display}. תאר את סגנון הכתיבה, הנושאים המרכזיים ביצירתו/ה, ומה הופך אותו/ה לדמות משמעותית בספרות.',
  painters:    'כתוב 2-3 משפטים בעברית על האמן/האמנית {display}. תאר את סגנון הציור, הנושאים המרכזיים ביצירתו/ה, ומה הופך אותו/ה לדמות משמעותית באמנות.',
  philosophers:'כתוב 2-3 משפטים בעברית על הפילוסוף/הפילוסופית {display}. תאר את עיקרי הגותו/ה, ומה הופך אותו/ה לדמות משמעותית בפילוסופיה.',
  films:       'כתוב 2-3 משפטים בעברית על הסרט {display}. תאר את עלילת הסרט, הנושאים המרכזיים, ומה הופך אותו לסרט משמעותי.',
  books:       'כתוב 2-3 משפטים בעברית על הספר {display}. תאר את עלילת הספר, הנושאים המרכזיים, ומה הופך אותו לספר משמעותי.',
  paintings:   'כתוב 2-3 משפטים בעברית על היצירה {display}. תאר את הטכניקה, הנושאים המרכזיים, ומה הופך אותה ליצירה משמעותית.',
  philosophers:'כתוב 2-3 משפטים בעברית על הפילוסוף/הפילוסופית {display}. תאר את עיקרי הגותו/ה, ומה הופך אותו/ה לדמות משמעותית בפילוסופיה.',
}
const DEFAULT_ENTITY_DESC = 'כתוב 2-3 משפטים בעברית על {display}.'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function callGemini(prompt: string, jsonMode = false): Promise<string> {
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: jsonMode ? 0.1 : 0.3,
      maxOutputTokens: jsonMode ? 8000 : 2000,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  })
  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

async function callGemini3x(prompt: string): Promise<object[]> {
  const results: object[] = []
  for (let i = 0; i < 3; i++) {
    try {
      const text = await callGemini(prompt, true)
      const cleaned = text.replace(/^```json\s*/m, '').replace(/^```\s*$/m, '').trim()
      results.push(JSON.parse(cleaned))
    } catch {
      results.push({})
    }
  }
  return results
}

function mergeEntityRuns(runs: object[]): Record<string, { discussed: string[]; mentioned: string[] }> {
  const merged: Record<string, { discussed: string[]; mentioned: string[] }> = {}
  for (const et of ENTITY_TYPES) {
    const discussed: string[] = []
    const mentioned: string[] = []
    const seenD = new Set<string>()
    const seenM = new Set<string>()
    for (const run of runs) {
      const r = (run as Record<string, Record<string, string[]>>)[et] ?? {}
      for (const name of r.discussed ?? []) {
        if (!seenD.has(name.toLowerCase())) { seenD.add(name.toLowerCase()); discussed.push(name) }
      }
      for (const name of r.mentioned ?? []) {
        if (!seenM.has(name.toLowerCase())) { seenM.add(name.toLowerCase()); mentioned.push(name) }
      }
    }
    merged[et] = { discussed, mentioned }
  }
  return merged
}

async function fetchCurrentEntities(lectureId: number) {
  const current: Record<string, { discussed: string[]; mentioned: string[] }> = {}
  for (const [et, cfg] of Object.entries(JOIN_TABLES)) {
    const { data } = await supabase
      .from(cfg.join)
      .select(`relationship_type, ${et}!inner(${cfg.name})`)
      .eq('lecture_id', lectureId)
    current[et] = { discussed: [], mentioned: [] }
    for (const row of data ?? []) {
      const name = (row as Record<string, Record<string, string>>)[et]?.[cfg.name] ?? ''
      const bucket = row.relationship_type === 'discussed' ? 'discussed' : 'mentioned'
      if (name) current[et][bucket].push(name)
    }
  }
  return current
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      type: GenerateType
      lectureId?: number
      courseId?: number
      entityType?: string
      entityId?: number
    }

    // ── summary_pdf — queue to regen_jobs ─────────────────────────────────
    if (body.type === 'summary_pdf') {
      if (!body.lectureId) return NextResponse.json({ error: 'lectureId required' }, { status: 400 })
      const { data, error } = await supabase
        .from('regen_jobs')
        .insert({ job_type: 'summary_pdf', lecture_id: body.lectureId })
        .select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ status: 'queued', jobId: data.id })
    }

    // ── lecture_title / lecture_synopsis — need transcript ─────────────────
    if (body.type === 'lecture_title' || body.type === 'lecture_synopsis') {
      if (!body.lectureId) return NextResponse.json({ error: 'lectureId required' }, { status: 400 })
      const { data: lec } = await supabase
        .from('lectures').select('id,title,synopsis,order_in_course,course_id')
        .eq('id', body.lectureId).single()
      if (!lec) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 })

      const { data: course } = await supabase
        .from('courses').select('r2_dir').eq('id', lec.course_id).single()
      if (!course?.r2_dir) return NextResponse.json({ error: 'r2_dir not set on course' }, { status: 400 })

      const transcript = await getR2Text(`${course.r2_dir}/${lec.order_in_course}/transcript.txt`)
      const prompt = TITLE_SYNOPSIS_PROMPT.replace('{transcript}', transcript.slice(0, 15000))
      const text   = await callGemini(prompt)

      let title = '', synopsis = ''
      const synopsisLines: string[] = []
      let inSynopsis = false
      for (const line of text.split('\n')) {
        const stripped = line.trim()
        if (stripped.startsWith('TITLE:'))    { title = stripped.slice(6).trim(); inSynopsis = false }
        else if (stripped.startsWith('SYNOPSIS:')) { const f = stripped.slice(9).trim(); if (f) synopsisLines.push(f); inSynopsis = true }
        else if (inSynopsis && stripped)     { synopsisLines.push(stripped) }
      }
      synopsis = synopsisLines.join(' ').trim()

      if (body.type === 'lecture_title') {
        return NextResponse.json({ type: 'lecture_title', lectureId: body.lectureId, before: lec.title, after: title })
      } else {
        return NextResponse.json({ type: 'lecture_synopsis', lectureId: body.lectureId, before: lec.synopsis, after: synopsis })
      }
    }

    // ── course_synopsis ───────────────────────────────────────────────────
    if (body.type === 'course_synopsis') {
      if (!body.courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })
      const { data: course } = await supabase
        .from('courses').select('id,title,description').eq('id', body.courseId).single()
      if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

      const { data: lectures } = await supabase
        .from('lectures').select('title,synopsis').eq('course_id', body.courseId).order('order_in_course')
      const lecturesText = (lectures ?? [])
        .filter(l => l.synopsis)
        .map((l, i) => `Lecture ${i + 1}: ${l.title}\n${l.synopsis}`)
        .join('\n\n')

      const prompt = COURSE_SYNOPSIS_PROMPT
        .replace('{title}', course.title)
        .replace('{lectures}', lecturesText)
      const after = await callGemini(prompt)

      return NextResponse.json({ type: 'course_synopsis', courseId: body.courseId, before: course.description ?? '', after })
    }

    // ── entities ──────────────────────────────────────────────────────────
    if (body.type === 'entities') {
      if (!body.lectureId) return NextResponse.json({ error: 'lectureId required' }, { status: 400 })
      const { data: lec } = await supabase
        .from('lectures').select('id,order_in_course,course_id').eq('id', body.lectureId).single()
      if (!lec) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 })

      const { data: course } = await supabase
        .from('courses').select('r2_dir').eq('id', lec.course_id).single()
      if (!course?.r2_dir) return NextResponse.json({ error: 'r2_dir not set on course' }, { status: 400 })

      const transcript = await getR2Text(`${course.r2_dir}/${lec.order_in_course}/transcript.txt`)
      const prompt     = ENTITIES_ALL_PROMPT.replace('{transcript}', transcript)
      const runs       = await callGemini3x(prompt)
      const extracted  = mergeEntityRuns(runs)
      const current    = await fetchCurrentEntities(body.lectureId)

      return NextResponse.json({ type: 'entities', lectureId: body.lectureId, current, extracted })
    }

    // ── entity_desc ───────────────────────────────────────────────────────
    if (body.type === 'entity_desc') {
      if (!body.entityType || !body.entityId) {
        return NextResponse.json({ error: 'entityType and entityId required' }, { status: 400 })
      }
      const nameField = ['films','books','paintings'].includes(body.entityType) ? 'title' : 'name'
      const { data: row } = await supabase
        .from(body.entityType).select(`id,${nameField},hebrew_name,description`)
        .eq('id', body.entityId).single()
      if (!row) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })

      const name        = (row as Record<string,string>)[nameField] ?? ''
      const hebrewName  = (row as Record<string,string>).hebrew_name ?? ''
      const display     = hebrewName ? `${hebrewName} (${name})` : name
      const template    = ENTITY_DESC_PROMPTS[body.entityType] ?? DEFAULT_ENTITY_DESC
      const prompt      = template.replace(/\{display\}/g, display).replace(/\{name\}/g, name)
      const after       = await callGemini(prompt)

      return NextResponse.json({
        type: 'entity_desc', entityType: body.entityType, entityId: body.entityId,
        name, before: (row as Record<string,string>).description ?? '', after,
      })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    console.error('[generate]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
