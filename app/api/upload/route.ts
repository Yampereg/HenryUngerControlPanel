import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { uploadToR2 } from '@/lib/r2'
import { ENTITY_TYPES, R2_IMAGES_PREFIX } from '@/lib/constants'

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()

    const file        = form.get('file')       as File   | null
    const entityType  = form.get('entityType') as string | null
    const entityIdStr = form.get('entityId')   as string | null

    if (!file || !entityType || !entityIdStr) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!(entityType in ENTITY_TYPES)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
    }

    const entityId = parseInt(entityIdStr, 10)

    // 1. Read → Buffer
    const arrayBuffer = await file.arrayBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let imageBuffer: any = Buffer.from(new Uint8Array(arrayBuffer))

    // 2. Normalise to JPEG (auto-rotate by EXIF, quality 92)
    imageBuffer = await sharp(imageBuffer)
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer()

    // 3. Upload to R2 (overwrites if exists)
    const r2Key = `${R2_IMAGES_PREFIX}/${entityType}/${entityId}.jpeg`
    await uploadToR2(r2Key, imageBuffer, 'image/jpeg')

    const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''
    const publicUrl  = publicBase ? `${publicBase}/${r2Key}` : r2Key

    return NextResponse.json({ success: true, r2Key, publicUrl })
  } catch (err) {
    console.error('[upload]', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
