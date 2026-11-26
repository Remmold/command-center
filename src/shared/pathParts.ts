/** The folder part of a path, splitting on either separator; "" when the path has none. */
export function dirnameOf(file: string): string {
  const cut = Math.max(file.lastIndexOf('/'), file.lastIndexOf(String.fromCharCode(92)))
  return cut < 0 ? '' : file.slice(0, cut)
}
