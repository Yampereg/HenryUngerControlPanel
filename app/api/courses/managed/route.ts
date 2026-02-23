import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/courses/managed
// Returns courses that have an r2_dir set (managed via Course Uploader).
export async function GET() {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, r2_dir, subject_id')
    .not('r2_dir', 'is', null)
    .order('id', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ courses: data ?? [] })
}
