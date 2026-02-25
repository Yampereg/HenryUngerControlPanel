// LOCATION: app/api/entities/duplicates/route.ts

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Keys } from '@/lib/r2'
import { ENTITY_TYPES, JUNCTION_MAP, EntityType, R2_IMAGES_PREFIX } from '@/lib/constants'

// All entity types eligible for duplicate detection (excluding courses/lectures)
const ALL_TYPES: EntityType[] = [
  'directors', 'writers', 'philosophers',
  'films', 'books', 'painters', 'paintings',
]

/**
 * Two entities can be compared/merged if they share the same type,
 * OR both are "person" types (can be misclassified),
 * OR both are "work" types (can be misclassified).
 *
 * Person types: directors, writers, philosophers, painters
 * Work types:   films, books, paintings
 *
 * We allow ALL cross-type comparisons — the user decides what to merge.
 */
function canCompare(typeA: EntityType, typeB: EntityType): boolean {
  if (typeA === typeB) return true
  // Allow all cross-type comparisons across ALL_TYPES
  return ALL_TYPES.includes(typeA) && ALL_TYPES.includes(typeB)
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

  if ((na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 4) {
    return 0.85
  }

  const lastA = na.split(/\s+/).at(-1) ?? na
  const lastB = nb.split(/\s+/).at(-1) ?? nb
  if (lastA.length >= 4 && lastA === lastB) return 0.82

  const dist = levenshtein(na, nb)
  return 1 - dist / Math.max(na.length, nb.length)
}

const FUZZY_THRESHOLD = 0.80

// ── Route ─────────────────────────────────────────────────────────────────────

interface DuplicateGroup {
  name: string
  entities: { id: number; type: EntityType; displayName: string; hebrewName: string | null; connectionCount: number; hasImage: boolean }[]
  matchType: 'exact' | 'similar'
  similarity: number
}

export async function GET() {
  try {
    // 1. Fetch all entities from all types
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

    // 2. Connection counts
    const junctionCounts = new Map<string, number>()
    await Promise.all(
      ALL_TYPES.map(async (type) => {
        const junc = JUNCTION_MAP[type]
        if (!junc) return
        const { data } = await supabase.from(junc.table).select(junc.fkCol)
        for (const row of (data ?? []) as unknown as Record<string, number>[]) {
          const key = `${type}:${row[junc.fkCol]}`
          junctionCounts.set(key, (junctionCounts.get(key) ?? 0) + 1)
        }
      }),
    )

    // 3. Image existence
    const imageExists = new Map<string, boolean>()
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

    // 5. Exact matches — group by lowercase name, across all comparable types
    // Key: normalized name. Group all entities with same name that canCompare with each other.
    const byName = new Map<string, typeof allEntities>()
    for (const entity of allEntities) {
      const name = entity.displayName.trim().toLowerCase()
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name)!.push(entity)
    }

    const exactGroups: DuplicateGroup[] = []
    for (const [, group] of byName) {
      if (group.length < 2) continue
      // Filter to pairs that canCompare
      const eligible: typeof allEntities = []
      for (const entity of group) {
        if (eligible.some(e => canCompare(e.type, entity.type))) {
          eligible.push(entity)
        } else if (eligible.length === 0) {
          eligible.push(entity)
        }
      }
      if (eligible.length > 1) {
        exactGroups.push({
          name:       eligible[0].displayName,
          entities:   eligible,
          matchType:  'exact',
          similarity: 1.0,
        })
      }
    }

    // 6. Fuzzy (similar) matches — only among non-exact entities
    const exactIds = new Set(exactGroups.flatMap(g => g.entities.map(e => `${e.type}:${e.id}`)))
    const candidates = allEntities.filter(e => !exactIds.has(`${e.type}:${e.id}`))

    const similarGroups: DuplicateGroup[] = []
    const usedInSimilar = new Set<string>()

    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i]
      const keyA = `${a.type}:${a.id}`
      if (usedInSimilar.has(keyA)) continue

      for (let j = i + 1; j < candidates.length; j++) {
        const b = candidates[j]
        if (!canCompare(a.type, b.type)) continue

        const keyB = `${b.type}:${b.id}`
        if (usedInSimilar.has(keyB)) continue

        const sim = nameSimilarity(a.displayName, b.displayName)
        if (sim >= FUZZY_THRESHOLD && sim < 1.0) {
          const existingGroup = similarGroups.find(g =>
            g.entities.some(e => `${e.type}:${e.id}` === keyA) ||
            g.entities.some(e => `${e.type}:${e.id}` === keyB),
          )

          if (existingGroup) {
            if (!existingGroup.entities.some(e => `${e.type}:${e.id}` === keyA)) {
              existingGroup.entities.push(a)
              usedInSimilar.add(keyA)
            }
            if (!existingGroup.entities.some(e => `${e.type}:${e.id}` === keyB)) {
              existingGroup.entities.push(b)
              usedInSimilar.add(keyB)
            }
            existingGroup.similarity = Math.max(existingGroup.similarity, sim)
          } else {
            similarGroups.push({
              name:       a.displayName,
              entities:   [a, b],
              matchType:  'similar',
              similarity: sim,
            })
            usedInSimilar.add(keyA)
            usedInSimilar.add(keyB)
          }
        }
      }
    }

    return NextResponse.json({ exact: exactGroups, similar: similarGroups })
  } catch (e) {
    console.error('[duplicates]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}