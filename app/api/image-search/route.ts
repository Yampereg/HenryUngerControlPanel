import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.GOOGLE_CSE_API_KEY!
const CSE_ID  = process.env.GOOGLE_CSE_ID!

interface SearchResult {
  urls:   string[]
  debug?: object
}

async function searchGoogleCSE(q: string, num: number): Promise<SearchResult> {
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

  const res  = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)
  const json = await res.json()

  if (!res.ok) {
    return { urls: [], debug: { status: res.status, error: json.error } }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const urls = (json.items ?? []).map((item: any) => item.link as string)
  const debug = urls.length === 0
    ? { status: res.status, responseKeys: Object.keys(json), searchInfo: json.searchInformation }
    : undefined

  return { urls, debug }
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
  const debugInfo: object[] = []

  if (type === 'films') {
    const [wiki, pos, general] = await Promise.all([
      searchGoogleCSE(`"${name}" movie poster site:en.wikipedia.org`, 3),
      searchGoogleCSE(`"${name}" movie poster site:posteritati.com`, 3),
      searchGoogleCSE(`"${name}" movie poster${hint}`, 4),
    ])
    if (wiki.debug)    debugInfo.push({ call: 'wikipedia',  ...wiki.debug })
    if (pos.debug)     debugInfo.push({ call: 'posteritati', ...pos.debug })
    if (general.debug) debugInfo.push({ call: 'general',    ...general.debug })
    images = dedup([...wiki.urls, ...pos.urls, ...general.urls]).slice(0, 6)
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
    const result = await searchGoogleCSE(q, 6)
    if (result.debug) debugInfo.push(result.debug)
    images = result.urls
  }

  return NextResponse.json({ images, ...(debugInfo.length ? { debug: debugInfo } : {}) })
}
