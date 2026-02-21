import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Keys } from '@/lib/r2'
import { ENTITY_TYPES, JUNCTION_MAP, EntityType, R2_IMAGES_PREFIX } from '@/lib/constants'

// Cross-category types: compared with each other AND within themselves
const CROSS_TYPES: EntityType[] = ['directors', 'writers', 'philosophers']
// Self-only types: compared only within the same category (books↔books, films↔films)
const SELF_TYPES:  EntityType[] = ['books', 'films']
const ALL_TYPES:   EntityType[] = [...CROSS_TYPES, ...SELF_TYPES]

/** Two entities can be compared/merged only if they're the same type, or both are cross-types. */
function canCompare(typeA: EntityType, typeB: EntityType): boolean {
  if (typeA === typeB) return true
  return CROSS_TYPES.includes(typeA) && CROSS_TYPES.includes(typeB)
}

// ── Fuzzy name similarity ─────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function nameSimilarity(a: string, b: string): number {
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (na === nb) return 1.0

  // One name fully contains the other (e.g. "Kant" inside "Immanuel Kant")
  if ((na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 4) {
    return 0.85
  }

  // Shared last word / surname (e.g. "Smith" in "John Smith" and "Jane Smith")
  const lastA = na.split(/\s+/).at(-1) ?? na
  const lastB = nb.split(/\s+/).at(-1) ?? nb
  if (lastA.length >= 4 && lastA === lastB) return 0.82

  // Levenshtein normalised by the longer name
  const dist = levenshtein(na, nb)
  return 1 - dist / Math.max(na.length, nb.length)
}

const FUZZY_THRESHOLD = 0.80

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Fetch all entities from all five types
    const entityResults = await Promise.all(
      ALL_TYPES.map(async (type) => {
        const { nameField } = ENTITY_TYPES[type]
        const { data, error } = await supabase
          .from(type)
          .select(`id, ${nameField}, hebrew_name`)
        if (error) throw error
        return (data ?? []).map((row: Record<string, unknown>) => ({
          id:          row.id          as number,
          type,
          displayName: row[nameField]  as string,
          hebrewName:  (row.hebrew_name as string | null) ?? null,
        }))
      }),
    )

    // 2. Connection counts — one query per junction table, then count per entity
    const junctionCounts = new Map<string, number>()   // key: `${type}:${id}`
    await Promise.all(
      ALL_TYPES.map(async (type) => {
        const junc = JUNCTION_MAP[type]
        if (!junc) return
        const { data } = await supabase.from(junc.table).select(junc.fkCol)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of (data ?? []) as unknown as Record<string, number>[]) {
          const key = `${type}:${row[junc.fkCol]}`
          junctionCounts.set(key, (junctionCounts.get(key) ?? 0) + 1)
        }
      }),
    )

    // 3. Image existence — list R2 keys for all five prefixes
    const imageExists = new Map<string, boolean>()     // key: `${type}:${id}`
    await Promise.all(
      ALL_TYPES.map(async (type) => {
        const prefix = `${R2_IMAGES_PREFIX}/${type}/`
        const keys   = await listR2Keys(prefix)
        for (const key of keys) {
          const id = parseInt(key.replace(prefix, '').split('.')[0], 10)
          if (!isNaN(id)) imageExists.set(`${type}:${id}`, true)
        }
      }),
    )

    // 4. Build enriched entity list
    const allEntities = entityResults.flat().map(e => ({
      ...e,
      connectionCount: junctionCounts.get(`${e.type}:${e.id}`) ?? 0,
      hasImage:        imageExists.get(`${e.type}:${e.id}`) ?? false,
    }))

    // 5. Exact matches — group by (name, merge-bucket):
    //    cross-types share a bucket; self-only types each have their own bucket.
    //    This prevents e.g. a book and a film with the same title being suggested.
    const byNameBucket = new Map<string, typeof allEntities>()
    for (const entity of allEntities) {
      const name   = entity.displayName.trim().toLowerCase()
      const bucket = CROSS_TYPES.includes(entity.type) ? '__cross__' : entity.type
      const key    = `${name}|${bucket}`
      if (!byNameBucket.has(key)) byNameBucket.set(key, [])
      byNameBucket.get(key)!.push(entity)
    }
    const exactGroups = Array.from(byNameBucket.values())
      .filter(g => g.length >= 2)
      .map(g => ({
        name:       g[0].displayName,
        entities:   g,
        matchType:  'exact' as const,
        similarity: 1.0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Track which pairs are already covered by exact matches
    const exactPairKeys = new Set<string>()
    for (const g of exactGroups)
      for (let i = 0; i < g.entities.length; i++)
        for (let j = i + 1; j < g.entities.length; j++) {
          const ids = [`${g.entities[i].type}:${g.entities[i].id}`,
                       `${g.entities[j].type}:${g.entities[j].id}`].sort()
          exactPairKeys.add(ids.join('|'))
        }

    // 6. Fuzzy similar pairs — respects canCompare() rules
    const similarGroups: typeof exactGroups = []
    const seenPairs = new Set<string>()

    for (let i = 0; i < allEntities.length; i++) {
      for (let j = i + 1; j < allEntities.length; j++) {
        const a = allEntities[i], b = allEntities[j]

        // Skip pairs that cross self-only type boundaries
        if (!canCompare(a.type, b.type)) continue

        const pairKey = [`${a.type}:${a.id}`, `${b.type}:${b.id}`].sort().join('|')
        if (seenPairs.has(pairKey) || exactPairKeys.has(pairKey)) continue
        seenPairs.add(pairKey)

        const sim = nameSimilarity(a.displayName, b.displayName)
        if (sim >= FUZZY_THRESHOLD && sim < 1.0) {
          const name = a.displayName.length >= b.displayName.length
            ? a.displayName : b.displayName
          similarGroups.push({ name, entities: [a, b], matchType: 'similar', similarity: sim })
        }
      }
    }
    similarGroups.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))

    return NextResponse.json({ exact: exactGroups, similar: similarGroups })
  } catch (err) {
    console.error('[duplicates]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
