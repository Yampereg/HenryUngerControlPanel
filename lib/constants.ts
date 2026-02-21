export const ENTITY_TYPES = {
  courses:      { label: 'Courses',      nameField: 'title' as const, icon: '🎓' },
  directors:    { label: 'Directors',    nameField: 'name'  as const, icon: '🎬' },
  films:        { label: 'Films',        nameField: 'title' as const, icon: '🎞' },
  writers:      { label: 'Writers',      nameField: 'name'  as const, icon: '✍️' },
  books:        { label: 'Books',        nameField: 'title' as const, icon: '📚' },
  painters:     { label: 'Painters',     nameField: 'name'  as const, icon: '🎨' },
  paintings:    { label: 'Paintings',    nameField: 'title' as const, icon: '🖼' },
  philosophers: { label: 'Philosophers', nameField: 'name'  as const, icon: '🏛' },
} as const

export type EntityType = keyof typeof ENTITY_TYPES

export interface Entity {
  id:           number
  displayName:  string
  hasImage?:    boolean
  hebrewName?:  string | null
  description?: string | null
}

// Junction table info for each editable entity type (used for delete cleanup)
export const JUNCTION_MAP: Partial<Record<EntityType, { table: string; fkCol: string }>> = {
  directors:    { table: 'lecture_directors',    fkCol: 'director_id'    },
  films:        { table: 'lecture_films',        fkCol: 'film_id'        },
  writers:      { table: 'lecture_writers',      fkCol: 'writer_id'      },
  books:        { table: 'lecture_books',        fkCol: 'book_id'        },
  painters:     { table: 'lecture_painters',     fkCol: 'painter_id'     },
  paintings:    { table: 'lecture_paintings',    fkCol: 'painting_id'    },
  philosophers: { table: 'lecture_philosophers', fkCol: 'philosopher_id' },
}

export const R2_IMAGES_PREFIX = 'images'
