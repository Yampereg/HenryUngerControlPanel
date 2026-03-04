import { NextRequest, NextResponse } from 'next/server'

const IMAGE_SERVICE_URL   = process.env.IMAGE_SERVICE_URL!
const IMAGE_SERVICE_TOKEN = process.env.IMAGE_SERVICE_TOKEN!

export interface ImageResult {
  url:           string
  score:         number
  was_bw:        boolean
  colorize_key:  string | null
  error?:        string
}

export async function POST(req: NextRequest) {
  const { urls, entity_type } = await req.json() as { urls: string[]; entity_type: string }

  if (!urls?.length || !entity_type) {
    return NextResponse.json({ results: [] })
  }

  if (!IMAGE_SERVICE_URL) {
    // Image service not configured — return neutral scores so UI still works
    return NextResponse.json({
      results: urls.map(url => ({ url, score: 5.0, was_bw: false, colorize_key: null })),
    })
  }

  try {
    const res = await fetch(`${IMAGE_SERVICE_URL}/process`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-token':      IMAGE_SERVICE_TOKEN,
      },
      body:   JSON.stringify({ urls, entity_type }),
      signal: AbortSignal.timeout(90_000),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[image-process] VM error:', res.status, text)
      return NextResponse.json(
        { error: `Image service error: ${res.status}` },
        { status: 502 },
      )
    }

    const results: ImageResult[] = await res.json()
    return NextResponse.json({ results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[image-process]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
