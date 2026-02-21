import { NextRequest, NextResponse } from 'next/server'

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  // Validate URL scheme
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImageManager/1.0; +https://github.com)',
        'Accept': 'image/*,*/*',
      },
      // Abort after 15 s
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Remote server returned ${res.status} ${res.statusText}` },
        { status: 400 },
      )
    }

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'

    // Accept images or octet-stream (some servers don't set content-type correctly)
    if (!contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
      return NextResponse.json(
        { error: 'URL does not point to an image' },
        { status: 400 },
      )
    }

    const buffer = await res.arrayBuffer()

    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image exceeds 20 MB limit' }, { status: 400 })
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[fetch-image]', msg)
    return NextResponse.json({ error: `Could not fetch image: ${msg}` }, { status: 500 })
  }
}
