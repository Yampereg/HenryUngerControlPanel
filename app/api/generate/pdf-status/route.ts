import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/generate/pdf-status?lectureId=N
export async function GET(req: NextRequest) {
  const lectureId = Number(req.nextUrl.searchParams.get('lectureId'))
  if (!lectureId) return NextResponse.json({ error: 'lectureId required' }, { status: 400 })

  const { data } = await supabase
    .from('regen_jobs')
    .select('id,status,created_at')
    .eq('lecture_id', lectureId)
    .eq('job_type', 'summary_pdf')
    .order('created_at', { ascending: false })
    .limit(1)

  return NextResponse.json({ job: data?.[0] ?? null })
}
