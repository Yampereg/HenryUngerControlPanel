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

  if (date !== undefined) {
    await supabase.from('lectures').update({ date: date || null }).eq('id', lectureId)
  }

  if (places !== undefined) {
    await supabase.from('lecture_places').delete().eq('lecture_id', lectureId)
    if (places.length > 0) {
      await supabase.from('lecture_places').insert(places.map(p => ({ lecture_id: lectureId, place: p })))
    }
  }

  if (years !== undefined) {
    await supabase.from('lecture_years').delete().eq('lecture_id', lectureId)
    if (years.length > 0) {
      await supabase.from('lecture_years').insert(years.map(y => ({ lecture_id: lectureId, year: y })))
    }
  }

  return NextResponse.json({ ok: true })
}
