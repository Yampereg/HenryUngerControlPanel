// LOCATION: app/api/courses/meta/route.ts  (NEW file — create this folder)

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/courses/meta?courseId=X  or  ?allPlaces=true
export async function GET(req: NextRequest) {
  // Return all distinct places across all courses (for PlacesEditor suggestions)
  if (req.nextUrl.searchParams.get('allPlaces') === 'true') {
    const { data } = await supabase.from('course_places').select('place').order('place')
    const seen = new Set<string>()
    const distinct: string[] = []
    for (const row of (data ?? []) as { place: string }[]) {
      if (!seen.has(row.place)) { seen.add(row.place); distinct.push(row.place) }
    }
    return NextResponse.json({ places: distinct })
  }

  const courseId = parseInt(req.nextUrl.searchParams.get('courseId') ?? '', 10)
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

  const [placesRes, yearsRes] = await Promise.all([
    supabase.from('course_places').select('id, place').eq('course_id', courseId).order('id'),
    supabase.from('course_years').select('id, year').eq('course_id', courseId).order('year'),
  ])

  return NextResponse.json({
    places: ((placesRes.data ?? []) as { id: number; place: string }[]).map(r => ({ id: r.id, value: r.place })),
    years:  ((yearsRes.data  ?? []) as { id: number; year:  number }[]).map(r => ({ id: r.id, value: r.year  })),
  })
}

// PATCH /api/courses/meta
// Body: { courseId, places?: string[], years?: number[] }
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    courseId: number
    places?:  string[]
    years?:   number[]
  }
  const { courseId, places, years } = body
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

  if (places !== undefined) {
    await supabase.from('course_places').delete().eq('course_id', courseId)
    if (places.length > 0) {
      await supabase.from('course_places').insert(places.map(p => ({ course_id: courseId, place: p })))
    }
  }

  if (years !== undefined) {
    await supabase.from('course_years').delete().eq('course_id', courseId)
    if (years.length > 0) {
      await supabase.from('course_years').insert(years.map(y => ({ course_id: courseId, year: y })))
    }
  }

  return NextResponse.json({ ok: true })
}