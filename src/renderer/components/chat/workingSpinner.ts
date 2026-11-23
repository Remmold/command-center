/** The extension's spinner glyphs (`mRe`), run forward then back (`hDt`) one frame each `SPINNER_FRAME_MS`. */
const FRAMES = ['·', '✢', '*', '✶', '✻', '✽'] as const
export const SPINNER_CYCLE: readonly string[] = [...FRAMES, ...[...FRAMES].reverse()]
export const SPINNER_FRAME_MS = 120
/** The one glyph shown when motion is reduced (`KNn`). */
export const STATIC_GLYPH = FRAMES[4]

/** Time between typing steps of a new verb (the extension's `GNn`). */
export const TYPE_STEP_MS = 40

/** The extension's `fRe`, in its order. */
export const SPINNER_VERBS: readonly string[] = [
  'Accomplishing', 'Actioning', 'Actualizing', 'Baking', 'Booping', 'Brewing', 'Calculating', 'Cerebrating', 'Channeling', 'Churning',
  'Clauding', 'Coalescing', 'Cogitating', 'Computing', 'Combobulating', 'Concocting', 'Considering', 'Contemplating', 'Cooking', 'Crafting',
  'Creating', 'Crunching', 'Deciphering', 'Deliberating', 'Determining', 'Discombobulating', 'Doing', 'Effecting', 'Elucidating', 'Enchanting',
  'Envisioning', 'Finagling', 'Flibbertigibbeting', 'Forging', 'Forming', 'Frolicking', 'Generating', 'Germinating', 'Hatching', 'Herding',
  'Honking', 'Ideating', 'Imagining', 'Incubating', 'Inferring', 'Manifesting', 'Marinating', 'Meandering', 'Moseying', 'Mulling',
  'Mustering', 'Noodling', 'Percolating', 'Perusing', 'Philosophizing', 'Pontificating', 'Pondering', 'Processing', 'Puttering', 'Puzzling',
  'Reticulating', 'Ruminating', 'Schlepping', 'Shimmying', 'Simmering', 'Smooshing', 'Spelunking', 'Spinning', 'Stewing', 'Sussing',
  'Synthesizing', 'Thinking', 'Tinkering', 'Transmuting', 'Unfurling', 'Unraveling', 'Vibing', 'Wandering', 'Whirring', 'Wibbling',
  'Working', 'Wrangling'
]

/** The widest label any verb makes, so the line keeps one width as verbs change. */
export const LABEL_WIDTH = Math.max(...SPINNER_VERBS.map((v) => v.length)) + 3

const DELAYS = [2000, 3000, 5000]

/** Milliseconds before the verb after the `n`th change (the extension's `gRe` timer). */
export function verbDelay(n: number): number {
  return DELAYS[n] ?? 5000
}

export function workingLabel(verb: string): string {
  return `${verb}...`
}

export type Pick = <T>(choices: readonly T[]) => T

export const randomPick: Pick = (choices) => choices[Math.floor(Math.random() * choices.length)]

export function padTo(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

/** The glyph `distance` places behind the cursor: the cursor itself, two of noise, then the target's own character. */
function glyphAt(target: string, distance: number, pick: Pick): string {
  if (target === ' ') return ' '
  if (distance === 3) return target
  if (distance > 0) return pick(['.', '_', target])
  return '▌'
}

/** One typing step of the extension's `GNn`: a cursor at `index`, the two characters before it scrambled, the third settled. */
export function typeStep(text: string, target: string, index: number, pick: Pick): string {
  const chars = [...text]
  for (let distance = 0; distance <= 3; distance++) {
    const at = index - distance
    if (at >= 0 && at < target.length) chars[at] = glyphAt(target[at], distance, pick)
  }
  return chars.join('')
}

export function typingDone(index: number, target: string): boolean {
  return index - 3 >= target.length
}
