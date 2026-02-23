import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

// POST /api/generate/confirm
// body: { type, action, data, lectureId?, courseId?, entityType?, entityId? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      type: string
      action: 'confirm' | 'accept_replace' | 'accept_new_only' | 'decline'
      data: Record<string, unknown>
      lectureId?: number
      courseId?: number
      entityType?: string
      entityId?: number
    }

    if (body.action === 'decline') {
      return NextResponse.json({ ok: true, message: 'Declined — no changes made' })
    }

    // ── lecture_title ──────────────────────────────────────────────────────
    if (body.type === 'lecture_title') {
      await supabase.from('lectures').update({ title: body.data.after }).eq('id', body.lectureId)
      return NextResponse.json({ ok: true })
    }

    // ── lecture_synopsis ───────────────────────────────────────────────────
    if (body.type === 'lecture_synopsis') {
      await supabase.from('lectures').update({ synopsis: body.data.after }).eq('id', body.lectureId)
      return NextResponse.json({ ok: true })
    }

    // ── course_synopsis ────────────────────────────────────────────────────
    if (body.type === 'course_synopsis') {
      await supabase.from('courses').update({ description: body.data.after }).eq('id', body.courseId)
      return NextResponse.json({ ok: true })
    }

    // ── entity_desc ────────────────────────────────────────────────────────
    if (body.type === 'entity_desc') {
      await supabase.from(body.entityType!).update({ description: body.data.after }).eq('id', body.entityId)
      return NextResponse.json({ ok: true })
    }

    // ── entities ───────────────────────────────────────────────────────────
    if (body.type === 'entities') {
      const lectureId  = body.lectureId!
      const extracted  = body.data.extracted as Record<string, { discussed: string[]; mentioned: string[] }>
      const current    = body.data.current  as Record<string, { discussed: string[]; mentioned: string[] }>

      if (body.action === 'accept_replace') {
        // Remove all existing junction rows for this lecture
        for (const cfg of Object.values(JOIN_TABLES)) {
          await supabase.from(cfg.join).delete().eq('lecture_id', lectureId)
        }
      }

      // Build a set of existing entity names (for accept_new_only dedup)
      const existingNames: Record<string, Set<string>> = {}
      if (body.action === 'accept_new_only') {
        for (const et of ENTITY_TYPES) {
          const all = [...(current[et]?.discussed ?? []), ...(current[et]?.mentioned ?? [])]
          existingNames[et] = new Set(all.map(n => n.toLowerCase()))
        }
      }

      // Insert new entities + links
      for (const et of ENTITY_TYPES) {
        const cfg = JOIN_TABLES[et]
        const linkedIds = new Set<number>()  // prevent duplicate junction rows per lecture

        for (const relType of ['discussed', 'mentioned'] as const) {
          for (const name of extracted[et]?.[relType] ?? []) {
            if (body.action === 'accept_new_only' && existingNames[et]?.has(name.toLowerCase())) {
              continue // skip existing
            }

            // get_or_create entity
            const nameField = cfg.name
            const { data: existing } = await supabase
              .from(et).select('id').eq(nameField, name).maybeSingle()

            let entityId: number
            if (existing) {
              entityId = existing.id
            } else {
              const { data: created } = await supabase
                .from(et).insert({ [nameField]: name }).select('id').single()
              entityId = created!.id
            }

            // skip if already linked (entity appears in both discussed + mentioned)
            if (linkedIds.has(entityId)) continue
            linkedIds.add(entityId)

            // upsert junction row
            await supabase.from(cfg.join).upsert({
              lecture_id: lectureId,
              [cfg.fk]: entityId,
              relationship_type: relType,
            }, { onConflict: `lecture_id,${cfg.fk}` })
          }
        }
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    console.error('[generate/confirm]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
