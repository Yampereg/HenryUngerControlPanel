// LOCATION: app/api/upload-jobs/next/route.ts  (NEW file — create this folder)

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// POST /api/upload-jobs/next
// Called by the daemon to atomically claim the oldest pending job.
// Returns { job } or { job: null } if nothing is pending.
// IMPORTANT: Checks for any globally running job first — if one is running, returns null.
// This enforces strict single-concurrency across ALL courses.
export async function POST(_req: NextRequest) {
  // 1. Is anything already running? If so, do nothing.
  const { data: runningRows } = await supabase
    .from('upload_jobs')
    .select('id')
    .eq('status', 'running')
    .limit(1)

  if (runningRows && runningRows.length > 0) {
    return NextResponse.json({ job: null })
  }

  // 2. Pick the oldest pending job (any course)
  const { data: pendingRows } = await supabase
    .from('upload_jobs')
    .select('id, course_id, lecture_number, r2_dir')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (!pendingRows || pendingRows.length === 0) {
    return NextResponse.json({ job: null })
  }

  const job = pendingRows[0] as {
    id:             number
    course_id:      number
    lecture_number: number
    r2_dir:         string
  }

  // 3. Atomically mark it as running
  const { error: updateErr } = await supabase
    .from('upload_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'pending')  // guard against race condition

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ job })
}