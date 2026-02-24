import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/lectures/meta?lectureId=X
export async function GET(req: NextRequest) {
  const lectureId = parseInt(req.nextUrl.searchParams.get('lectureId') ?? '', 10)
  if (!lectureId) return NextResponse.json({ error: 'lectureId required' }, { status: 400 })

  const [lectureRes, placesRes, yearsRes] = await Promise.all([
    supabase.from('lectures').select('date').eq('id', lectureId).single(),
    supabase.from('lecture_places').select('id, place').eq('lecture_id', lectureId).order('id'),
    supabase.from('lecture_years').select('id, year').eq('lecture_id', lectureId).order('year'),
  ])

  return NextResponse.json({
    date:   (lectureRes.data as { date: string | null } | null)?.date ?? null,
    places: ((placesRes.data ?? []) as { id: number; place: string }[]).map(r => ({ id: r.id, value: r.place })),
    years:  ((yearsRes.data  ?? []) as { id: number; year:  number }[]).map(r => ({ id: r.id, value: r.year  })),
  })
}

// PATCH /api/lectures/meta
// Body: { lectureId, date?, places?: string[], years?: number[] }
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    lectureId: number
    date?:     string | null
    places?:   string[]
    years?:    number[]
  }
  const { lectureId, date, places, years } = body
  if (!lectureId) return NextResponse.json({ error: 'lectureId required' }, { status: 400 })

  const ops: Promise<unknown>[] = []

  // Update date on lectures table
  if (date !== undefined) {
    ops.push(
      supabase.from('lectures')
        .update({ date: date || null })
        .eq('id', lectureId),
    )
  }

  // Replace all places for this lecture
  if (places !== undefined) {
    ops.push(
      supabase.from('lecture_places').delete().eq('lecture_id', lectureId).then(() =>
        places.length > 0
          ? supabase.from('lecture_places').insert(places.map(p => ({ lecture_id: lectureId, place: p })))
          : Promise.resolve(),
      ),
    )
  }

  // Replace all years for this lecture
  if (years !== undefined) {
    ops.push(
      supabase.from('lecture_years').delete().eq('lecture_id', lectureId).then(() =>
        years.length > 0
          ? supabase.from('lecture_years').insert(years.map(y => ({ lecture_id: lectureId, year: y })))
          : Promise.resolve(),
      ),
    )
  }

  await Promise.all(ops)
  return NextResponse.json({ ok: true })
}
