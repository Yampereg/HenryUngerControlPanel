import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET — fetch all history rows
export async function GET() {
  const { data, error } = await supabase
    .from('merge_history')
    .select('group_sig, action, keep_type')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — upsert one history entry
// body: { group_sig, action: 'approved'|'declined', keep_type?: string }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { error } = await supabase
    .from('merge_history')
    .upsert({ ...body }, { onConflict: 'group_sig' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — reset all history
export async function DELETE() {
  const { error } = await supabase.from('merge_history').delete().neq('id', 0)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
