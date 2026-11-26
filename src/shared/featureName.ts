const MAX_SLUG = 24
const VALID = /^[a-z0-9][a-z0-9-]*$/

/** A short folder- and branch-safe name from the words of a description. */
export function proposeSlug(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= MAX_SLUG) return slug
  const cut = slug.slice(0, MAX_SLUG)
  const atWord = slug[MAX_SLUG] === '-' ? cut : cut.slice(0, Math.max(cut.lastIndexOf('-'), 1))
  return atWord.replace(/-+$/, '')
}

/** Why the name cannot be used, or null. */
export function nameProblem(name: string, taken: readonly string[]): string | null {
  if (name.trim() === '') return 'A feature needs a name.'
  if (!VALID.test(name) || name.length > 40) {
    return 'Use lowercase letters, digits and dashes only, starting with a letter or digit (40 characters at most): the name becomes a folder and a branch.'
  }
  if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return `Another feature is already called ${name}.`
  return null
}
