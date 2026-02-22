import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/entities/deleted — list all backed-up deleted entities, newest first
export async function GET() {
  const { data, error } = await supabase
    .from('deleted_entities')
    .select('id, original_id, entity_type, name, hebrew_name, has_image, junction_data, deleted_at')
    .order('deleted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: data ?? [] })
}
