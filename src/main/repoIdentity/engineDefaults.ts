const UNITY_PLAYER = /^UnityPlayer\.dll$/i
const UNITY_CRASH_HANDLER = /^UnityCrashHandler(32|64)?\.exe$/i

/**
 * Files beside a game build that always carry its engine's own icon. A build whose project sets no
 * icon shows that same icon, so it is not the project's. `names` are the entries of the build's folder.
 */
export function engineIconReferences(names: readonly string[]): string[] {
  if (!names.some((n) => UNITY_PLAYER.test(n))) return []
  return names.filter((n) => UNITY_CRASH_HANDLER.test(n))
}
