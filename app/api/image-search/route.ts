import { NextRequest, NextResponse } from 'next/server'

// ── Types handled by Wikimedia Commons (+ Wikipedia for films) ────────────────
const WIKIMEDIA_TYPES = new Set(['philosophers', 'directors', 'writers', 'painters', 'paintings', 'films'])

// ── Wikimedia Commons ─────────────────────────────────────────────────────────

interface WikiPage {
  imageinfo?: Array<{
    url: string
    thumburl?: string
    mime: string
    mediatype: string
  }>
}

async function searchCommons(query: string, limit = 20): Promise<string[]> {
  const params = new URLSearchParams({
    action:       'query',
    generator:    'search',
    gsrsearch:    query,
    gsrnamespace: '6',
    gsrlimit:     String(limit),
    prop:         'imageinfo',
    iiprop:       'url|mime|mediatype',
    iiurlwidth:   '800',
    format:       'json',
    origin:       '*',
  })

  try {
    const res  = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { 'User-Agent': 'HenryUngerBot/1.0' },
      signal:  AbortSignal.timeout(10_000),
    })
    const json = await res.json()
    const pages: Record<string, WikiPage> = json?.query?.pages ?? {}

    return Object.values(pages)
      .flatMap((page) => {
        const info = page.imageinfo?.[0]
        if (!info) return []
        if (info.mediatype !== 'BITMAP') return []
        if (!info.mime.startsWith('image/') || info.mime === 'image/svg+xml') return []
        return [info.thumburl ?? info.url]
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

// ── Wikipedia pageimages (for film posters) ───────────────────────────────────

async function wikiPageImages(title: string): Promise<string[]> {
  // Search Wikipedia for the film article
  const searchParams = new URLSearchParams({
    action:      'query',
    list:        'search',
    srsearch:    `${title} film`,
    srnamespace: '0',
    srlimit:     '3',
    format:      'json',
    origin:      '*',
  })

  try {
    const searchRes  = await fetch(`https://en.wikipedia.org/w/api.php?${searchParams}`, {
      headers: { 'User-Agent': 'HenryUngerBot/1.0' },
      signal:  AbortSignal.timeout(10_000),
    })
    const searchJson = await searchRes.json()
    const hits: Array<{ title: string }> = searchJson?.query?.search ?? []
    if (!hits.length) return []

    // Fetch pageimages (infobox image) for top results
    const titles = hits.map(h => h.title).join('|')
    const imgParams = new URLSearchParams({
      action:      'query',
      titles,
      prop:        'pageimages',
      pithumbsize: '800',
      piprop:      'thumbnail',
      format:      'json',
      origin:      '*',
    })
    const imgRes  = await fetch(`https://en.wikipedia.org/w/api.php?${imgParams}`, {
      headers: { 'User-Agent': 'HenryUngerBot/1.0' },
      signal:  AbortSignal.timeout(10_000),
    })
    const imgJson = await imgRes.json()
    const pages: Record<string, { thumbnail?: { source: string } }> = imgJson?.query?.pages ?? {}

    return Object.values(pages)
      .map(p => p.thumbnail?.source)
      .filter((u): u is string => Boolean(u))
  } catch {
    return []
  }
}

// ── Google CSE (kept for books/courses) ──────────────────────────────────────

const GOOGLE_API_KEY = process.env.GOOGLE_CSE_API_KEY!
const GOOGLE_CSE_ID  = process.env.GOOGLE_CSE_ID!

async function searchGoogleCSE(q: string, num: number): Promise<string[]> {
  const params = new URLSearchParams({
    key: GOOGLE_API_KEY, cx: GOOGLE_CSE_ID,
    searchType: 'image', imgColorType: 'color',
    imgSize: 'large', safe: 'active',
    num: String(num), q,
  })
  try {
    const res  = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (json.items ?? []).map((item: any) => item.link as string)
  } catch {
    return []
  }
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

function dedup(urls: string[]): string[] {
  const seen = new Set<string>()
  return urls.filter(u => { if (seen.has(u)) return false; seen.add(u); return true })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type       = searchParams.get('type') ?? ''
  const name       = searchParams.get('name') ?? ''
  const hebrewName = searchParams.get('hebrewName') ?? ''

  if (!name) return NextResponse.json({ images: [] })

  let images: string[]

  if (WIKIMEDIA_TYPES.has(type)) {
    if (type === 'films') {
      // Wikipedia infobox poster + Commons poster search, in parallel
      const [wikiImgs, commonsImgs] = await Promise.all([
        wikiPageImages(name),
        searchCommons(`"${name}" poster`, 15),
      ])
      images = dedup([...wikiImgs, ...commonsImgs]).slice(0, 6)
    } else {
      const queryMap: Record<string, string> = {
        directors:    `"${name}" portrait`,
        writers:      `"${name}" portrait`,
        painters:     `"${name}" portrait`,
        philosophers: `"${name}" portrait`,
        paintings:    `"${name}"`,
      }
      const q = queryMap[type] ?? `"${name}"`
      const urls = await searchCommons(q, 20)
      // Fallback: broader search if exact match yields too few results
      const extra = urls.length < 3 ? await searchCommons(`${name} portrait`, 10) : []
      images = dedup([...urls, ...extra]).slice(0, 6)
    }
  } else {
    // Books / courses — Google CSE (legacy path)
    const hint = hebrewName ? ` ${hebrewName}` : ''
    const queryMap: Record<string, string> = {
      books:   `"${name}" book cover`,
      courses: `"${name}"${hint}`,
    }
    const q = queryMap[type] ?? `"${name}"${hint}`
    images = (await searchGoogleCSE(q, 6)).slice(0, 6)
  }

  return NextResponse.json({ images })
}
