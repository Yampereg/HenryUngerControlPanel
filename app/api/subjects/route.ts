import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/subjects — all subjects ordered by id
export async function GET() {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name_en, name_he')
    .order('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ subjects: data ?? [] })
}
