import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.GOOGLE_CSE_API_KEY!
const CSE_ID  = process.env.GOOGLE_CSE_ID!

async function searchGoogleCSE(q: string, num: number): Promise<string[]> {
  const params = new URLSearchParams({
    key:          API_KEY,
    cx:           CSE_ID,
    searchType:   'image',
    imgColorType: 'color',
    imgSize:      'large',
    safe:         'active',
    num:          String(num),
    q,
  })

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)
  const json = await res.json()

  if (!res.ok) {
    console.error('[image-search] Google API error:', JSON.stringify(json))
    return []
  }

  if (!json.items?.length) {
    console.warn('[image-search] 0 results for query:', q, '| response keys:', Object.keys(json))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json.items ?? []).map((item: any) => item.link as string)
}

function dedup(urls: string[]): string[] {
  const seen = new Set<string>()
  return urls.filter((u) => {
    if (seen.has(u)) return false
    seen.add(u)
    return true
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type       = searchParams.get('type') ?? ''
  const name       = searchParams.get('name') ?? ''
  const hebrewName = searchParams.get('hebrewName') ?? ''

  if (!name) return NextResponse.json({ images: [] })

  const hint = hebrewName ? ` ${hebrewName}` : ''

  let images: string[]

  if (type === 'films') {
    // 3-call parallel strategy: Wikipedia, Posteritati, general
    const [wikiResults, posResults, generalResults] = await Promise.all([
      searchGoogleCSE(`"${name}" movie poster site:en.wikipedia.org`, 3),
      searchGoogleCSE(`"${name}" movie poster site:posteritati.com`, 3),
      searchGoogleCSE(`"${name}" movie poster${hint}`, 4),
    ])
    images = dedup([...wikiResults, ...posResults, ...generalResults]).slice(0, 6)
  } else {
    const queryMap: Record<string, string> = {
      directors:    `"${name}" film director portrait photo${hint}`,
      writers:      `"${name}" author portrait photo${hint}`,
      painters:     `"${name}" painter portrait photo${hint}`,
      philosophers: `"${name}" philosopher portrait photo${hint}`,
      paintings:    `"${name}" painting`,
      books:        `"${name}" book cover`,
      courses:      `"${name}"`,
    }
    const q = queryMap[type] ?? `"${name}"${hint}`
    images = await searchGoogleCSE(q, 6)
  }

  return NextResponse.json({ images })
}
