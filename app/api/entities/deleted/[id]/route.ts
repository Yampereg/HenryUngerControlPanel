import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { R2_IMAGES_PREFIX } from '@/lib/constants'
import { deleteFromR2, r2KeyExists } from '@/lib/r2'

type Params = { params: Promise<{ id: string }> }

// DELETE /api/entities/deleted/[id] — permanently discard a backup (no restore possible)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const numericId = parseInt(id, 10)

  // Fetch the backup row to know if there's a stored image to clean up
  const { data: rows, error: fetchErr } = await supabase
    .from('deleted_entities')
    .select('entity_type, original_id, has_image')
    .eq('id', numericId)
    .limit(1)

  if (fetchErr || !rows?.length) {
    return NextResponse.json({ error: fetchErr?.message ?? 'Not found' }, { status: 404 })
  }

  const backup = rows[0] as { entity_type: string; original_id: number; has_image: boolean }

  // Delete the stored R2 image (best-effort)
  if (backup.has_image) {
    try {
      const deletedKey = `deleted/${R2_IMAGES_PREFIX}/${backup.entity_type}/${backup.original_id}.jpeg`
      if (await r2KeyExists(deletedKey)) {
        await deleteFromR2(deletedKey)
      }
    } catch (e) {
      console.warn('[DISCARD image]', e)
    }
  }

  // Delete the backup row
  const { error } = await supabase
    .from('deleted_entities')
    .delete()
    .eq('id', numericId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
