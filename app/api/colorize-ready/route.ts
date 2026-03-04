import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2, bucketName, r2KeyExists } from '@/lib/r2'

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ ready: false })

  const exists = await r2KeyExists(key)
  if (!exists) return NextResponse.json({ ready: false })

  // Generate a presigned URL valid for 1 hour
  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
    { expiresIn: 3600 },
  )

  return NextResponse.json({ ready: true, url })
}
