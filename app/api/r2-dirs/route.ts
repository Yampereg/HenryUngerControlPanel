import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Prefixes, listR2Keys } from '@/lib/r2'

// GET /api/r2-dirs
//
// Returns R2 course directories that are:
//   valid  — the folder contains ONLY numbered sub-dirs (no loose files at
//             the folder root), every numbered sub-dir has a metadata.json,
//             and every sub-dir name is purely numeric.
//   unused — no existing course row references this folder via r2_dir.
export async function GET() {
  try {
    // 1. All top-level R2 prefixes
    const topPrefixes = await listR2Prefixes('')

    // 2. Collect all folders already in use by existing courses
    const { data: allCourses, error: courseErr } = await supabase
      .from('courses')
      .select('r2_dir, course_r2_url')

    if (courseErr) {
      return NextResponse.json({ error: courseErr.message }, { status: 500 })
    }

    const usedDirs = new Set<string>()
    for (const c of allCourses ?? []) {
      // New courses: r2_dir column set directly
      if (c.r2_dir) usedDirs.add(c.r2_dir as string)

      // Old courses (before r2_dir column): extract folder from course_r2_url
      // e.g. https://bucket.r2.cloudflarestorage.com/film_course → "film_course"
      if (!c.r2_dir && c.course_r2_url) {
        try {
          const folder = new URL(c.course_r2_url as string).pathname
            .replace(/^\//, '').split('/')[0]
          if (folder) usedDirs.add(folder)
        } catch { /* invalid URL — skip */ }
      }
    }

    // 3. Validate each candidate in parallel
    const candidates = await Promise.all(
      topPrefixes.map(async prefix => {
        const folderName = prefix.replace(/\/$/, '')

        // Skip dirs already assigned to a course
        if (usedDirs.has(folderName)) return null

        // Fetch every key under this prefix (flat list, no limit)
        const allKeys = await listR2Keys(`${folderName}/`)
        if (allKeys.length === 0) return null

        const lectureNums  = new Set<number>()
        const withMetadata = new Set<number>()

        for (const key of allKeys) {
          // Strip the "folder/" prefix to get the relative path
          const relative = key.slice(`${folderName}/`.length)
          const slashIdx = relative.indexOf('/')

          if (slashIdx === -1) {
            // A file sitting directly inside the course folder (not in a subdir)
            // → folder structure is invalid
            return null
          }

          const subdirName = relative.slice(0, slashIdx)
          const filename   = relative.slice(slashIdx + 1)

          // Subdir name must be purely numeric (no zero-padding like "01")
          if (!/^\d+$/.test(subdirName)) return null

          const num = parseInt(subdirName, 10)
          if (num <= 0) return null

          lectureNums.add(num)

          if (filename === 'metadata.json') {
            withMetadata.add(num)
          }
        }

        if (lectureNums.size === 0) return null

        // Every numbered subdir must have a metadata.json
        for (const num of lectureNums) {
          if (!withMetadata.has(num)) return null
        }

        const defaultTitle = folderName
          .replace(/[_-]+/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())

        return { dir: folderName, lectureCount: lectureNums.size, defaultTitle }
      }),
    )

    return NextResponse.json({ dirs: candidates.filter(Boolean) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
