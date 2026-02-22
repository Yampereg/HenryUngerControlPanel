import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Prefixes, r2KeyExists } from '@/lib/r2'

// GET /api/r2-dirs
// Returns valid, unused R2 course directories.
// A dir is "valid" when it has at least one numeric sub-folder that contains
// a metadata.json file. A dir is "unused" when no course row references it
// via the r2_dir column.
export async function GET() {
  try {
    // 1. All top-level prefixes in the bucket
    const topPrefixes = await listR2Prefixes('')

    // 2. Already-used r2_dirs
    const { data: existingCourses, error: courseErr } = await supabase
      .from('courses')
      .select('r2_dir')
      .not('r2_dir', 'is', null)

    if (courseErr) {
      return NextResponse.json({ error: courseErr.message }, { status: 500 })
    }

    const usedDirs = new Set(
      (existingCourses ?? []).map(c => c.r2_dir as string).filter(Boolean),
    )

    // 3. For each unused top-level prefix, check if it is a valid course folder
    const candidates = await Promise.all(
      topPrefixes.map(async prefix => {
        const folderName = prefix.replace(/\/$/, '') // strip trailing slash

        // Skip already-assigned dirs
        if (usedDirs.has(folderName)) return null

        // Get immediate sub-prefixes (should be numeric lecture numbers)
        const subPrefixes = await listR2Prefixes(prefix)

        // Filter to purely-numeric subfolder names
        const numericNums = subPrefixes
          .map(s => {
            const part = s.replace(prefix, '').replace(/\/$/, '')
            const n    = parseInt(part, 10)
            return { prefix: s, num: n }
          })
          .filter(({ num }) => !isNaN(num) && num > 0)
          .sort((a, b) => a.num - b.num)

        if (numericNums.length === 0) return null

        // Spot-check: first lecture subfolder must have metadata.json
        const first      = numericNums[0]
        const metaKey    = `${first.prefix}metadata.json`
        const hasMetadata = await r2KeyExists(metaKey)
        if (!hasMetadata) return null

        // Build a human-readable default title
        const defaultTitle = folderName
          .replace(/[_-]+/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())

        return {
          dir:          folderName,
          lectureCount: numericNums.length,
          defaultTitle,
        }
      }),
    )

    const dirs = candidates.filter(Boolean)
    return NextResponse.json({ dirs })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
