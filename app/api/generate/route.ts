import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'
import { getR2Text } from '@/lib/r2'
import fs from 'fs'
import path from 'path'

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
  'painters','paintings','philosophers',
] as const

const JOIN_TABLES: Record<string, { join: string; fk: string; name: string }> = {
  directors:    { join: 'lecture_directors',    fk: 'director_id',    name: 'name'  },
  films:        { join: 'lecture_films',        fk: 'film_id',        name: 'title' },
  writers:      { join: 'lecture_writers',      fk: 'writer_id',      name: 'name'  },
  books:        { join: 'lecture_books',        fk: 'book_id',        name: 'title' },
  painters:     { join: 'lecture_painters',     fk: 'painter_id',     name: 'name'  },
  paintings:    { join: 'lecture_paintings',    fk: 'painting_id',    name: 'title' },
  philosophers: { join: 'lecture_philosophers', fk: 'philosopher_id', name: 'name'  },
}

const ENTITY_PROMPT_FILES: Record<string, string> = {
  directors:    'enrich_describe_director.txt',
  films:        'enrich_describe_film.txt',
  writers:      'enrich_describe_writer.txt',
  books:        'enrich_describe_book.txt',
  painters:     'enrich_describe_painter.txt',
  paintings:    'enrich_describe_painting.txt',
  philosophers: 'enrich_describe_philosopher.txt',
}

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------
function loadPrompt(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'prompts', filename), 'utf-8')
}

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------
const ENTITY_LIST_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    discussed: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    mentioned: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
}

const SCHEMAS = {
  titleSynopsis: {
    type: SchemaType.OBJECT,
    properties: {
      title:    { type: SchemaType.STRING },
      synopsis: { type: SchemaType.STRING },
    },
    required: ['title', 'synopsis'],
  },
  description: {
    type: SchemaType.OBJECT,
    properties: { description: { type: SchemaType.STRING } },
    required: ['description'],
  },
  entities: {
    type: SchemaType.OBJECT,
    properties: {
      directors:    ENTITY_LIST_SCHEMA,
      films:        ENTITY_LIST_SCHEMA,
      writers:      ENTITY_LIST_SCHEMA,
      books:        ENTITY_LIST_SCHEMA,
      painters:     ENTITY_LIST_SCHEMA,
      paintings:    ENTITY_LIST_SCHEMA,
      philosophers: ENTITY_LIST_SCHEMA,
      themes:       ENTITY_LIST_SCHEMA,
    },
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callGemini(prompt: string, jsonMode = false, temperature?: number, schema?: any): Promise<string> {
  const useJson = jsonMode || schema != null
  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: temperature ?? (jsonMode ? 0.1 : 0.3),
      maxOutputTokens: jsonMode ? 8000 : 6000,
      ...(useJson ? { responseMimeType: 'application/json' } : {}),
      ...(schema   ? { responseSchema: schema }               : {}),
    },
  })
  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

// ---------------------------------------------------------------------------
// JSON-based entity extraction using entities_all.txt (same as Transcriber).
// 3 runs, results merged — no text parsing, no comma/semicolon ambiguity.
// ---------------------------------------------------------------------------
async function extractEntities(
  transcript: string,
  appendNote: (p: string) => string,
): Promise<Record<string, { discussed: string[]; mentioned: string[] }>> {
  const NUM_RUNS = 3
  const allRuns: Record<string, { discussed: string[]; mentioned: string[] }>[] = []

  for (let run = 0; run < NUM_RUNS; run++) {
    try {
      const prompt = appendNote(
        loadPrompt('entities_all.txt').replace('{transcript}', transcript),
      )
      const text   = await callGemini(prompt, true, undefined, SCHEMAS.entities)
      // Strip markdown fences if present (older Gemini versions sometimes add them)
      const clean  = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      const data   = JSON.parse(clean) as Record<string, { discussed?: string[]; mentioned?: string[] }>

      const runResult: Record<string, { discussed: string[]; mentioned: string[] }> = {}
      for (const et of ENTITY_TYPES) {
        const etData = data[et] ?? {}
        runResult[et] = {
          discussed: (etData.discussed ?? []).filter((s): s is string => typeof s === 'string' && s.trim() !== ''),
          mentioned: (etData.mentioned ?? []).filter((s): s is string => typeof s === 'string' && s.trim() !== ''),
        }
      }
      allRuns.push(runResult)
    } catch {
      allRuns.push(
        Object.fromEntries(ENTITY_TYPES.map(et => [et, { discussed: [], mentioned: [] }])),
      )
    }
  }

  // Merge all runs: union by lowercase, preserving first-seen order
  const merged: Record<string, { discussed: string[]; mentioned: string[] }> = {}
  for (const et of ENTITY_TYPES) {
    const discussed: string[] = []
    const mentioned: string[] = []
    const seenD = new Set<string>()
    const seenM = new Set<string>()
    for (const run of allRuns) {
      for (const name of run[et]?.discussed ?? []) {
        if (!seenD.has(name.toLowerCase())) { seenD.add(name.toLowerCase()); discussed.push(name) }
      }
      for (const name of run[et]?.mentioned ?? []) {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      const name   = row[et]?.[cfg.name] ?? ''
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
      note?: string
    }

    function appendNote(prompt: string): string {
      if (!body.note?.trim()) return prompt
      return `${prompt}\n\nAdditional note: ${body.note.trim()}`
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
      const prompt = appendNote(loadPrompt('title_synopsis.txt').replace('{transcript}', transcript.slice(0, 15000)))

      function parseTitleSynopsis(text: string): { title: string; synopsis: string } {
        try { return JSON.parse(text) as { title: string; synopsis: string } } catch { /* fall through */ }
        let title = ''
        const synLines: string[] = []
        let inSyn = false
        for (const line of text.split('\n')) {
          const s = line.trim()
          if (s.startsWith('TITLE:'))         { title = s.slice(6).trim(); inSyn = false }
          else if (s.startsWith('SYNOPSIS:')) { const f = s.slice(9).trim(); if (f) synLines.push(f); inSyn = true }
          else if (inSyn && s)               { synLines.push(s) }
        }
        return { title, synopsis: synLines.join(' ').trim() }
      }

      if (body.type === 'lecture_title') {
        const texts = await Promise.all(
          Array.from({ length: 5 }, () => callGemini(prompt, false, 0.9, SCHEMAS.titleSynopsis)),
        )
        const titles = texts.map(t => parseTitleSynopsis(t).title).filter(Boolean)
        return NextResponse.json({ type: 'lecture_title', lectureId: body.lectureId, before: lec.title, titles })
      } else {
        const text    = await callGemini(prompt, false, undefined, SCHEMAS.titleSynopsis)
        const synopsis = parseTitleSynopsis(text).synopsis
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

      const prompt = appendNote(
        loadPrompt('course_synopsis.txt')
          .replace('{title}', course.title)
          .replace('{lectures}', lecturesText)
      )
      const text  = await callGemini(prompt, false, undefined, SCHEMAS.description)
      let after: string
      try { after = (JSON.parse(text) as { description: string }).description } catch { after = text }

      return NextResponse.json({ type: 'course_synopsis', courseId: body.courseId, before: course.description ?? '', after })
    }

    // ── entities — JSON-based, uses entities_all.txt ───────────────────────
    if (body.type === 'entities') {
      if (!body.lectureId) return NextResponse.json({ error: 'lectureId required' }, { status: 400 })
      const { data: lec } = await supabase
        .from('lectures').select('id,order_in_course,course_id').eq('id', body.lectureId).single()
      if (!lec) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 })

      const { data: course } = await supabase
        .from('courses').select('r2_dir').eq('id', lec.course_id).single()
      if (!course?.r2_dir) return NextResponse.json({ error: 'r2_dir not set on course' }, { status: 400 })

      const transcript = await getR2Text(`${course.r2_dir}/${lec.order_in_course}/transcript.txt`)
      const extracted  = await extractEntities(transcript, appendNote)
      const current    = await fetchCurrentEntities(body.lectureId)

      return NextResponse.json({ type: 'entities', lectureId: body.lectureId, current, extracted })
    }

    // ── entity_desc ───────────────────────────────────────────────────────
    if (body.type === 'entity_desc') {
      if (!body.entityType || !body.entityId) {
        return NextResponse.json({ error: 'entityType and entityId required' }, { status: 400 })
      }
      const nameField  = ['films','books','paintings'].includes(body.entityType) ? 'title' : 'name'
      const { data: row } = await supabase
        .from(body.entityType).select(`id,${nameField},hebrew_name,description`)
        .eq('id', body.entityId).single()
      if (!row) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })

      const name       = (row as Record<string,string>)[nameField] ?? ''
      const hebrewName = (row as Record<string,string>).hebrew_name ?? ''
      const display    = hebrewName ? `${hebrewName} (${name})` : name
      const entityKey  = body.entityType.replace(/s$/, '')
      const promptFile = ENTITY_PROMPT_FILES[body.entityType] ?? 'enrich_describe.txt'
      const template   = loadPrompt(promptFile)
      const prompt     = appendNote(
        template
          .replace(/\{display\}/g, display)
          .replace(/\{label\}/g, entityKey)
          .replace(/\{name\}/g, name)
          .replace(/\{hebrew_name\}/g, hebrewName || name)
      )
      const text2 = await callGemini(prompt, false, undefined, SCHEMAS.description)
      let after: string
      try { after = (JSON.parse(text2) as { description: string }).description } catch { after = text2 }

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
