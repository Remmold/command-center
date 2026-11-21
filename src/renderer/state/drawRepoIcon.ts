import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RepoIconSpec } from '../../shared/repoIdentity'
import { BUILTIN_ICONS } from '../components/repoIconSet'
import { letterColor } from '../components/RepoIcon'

const SIZE = 64
const RADIUS = 12

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('repo icon image failed to load'))
    img.src = src
  })
}

function svgDataUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

/** Draws the repo icon as a PNG data URL, the only picture form a Windows toast shows. */
export async function drawRepoIconPng(spec: RepoIconSpec): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d canvas')

  if (spec.kind === 'image') {
    const img = await loadImage(spec.src)
    const scale = Math.min(SIZE / (img.naturalWidth || SIZE), SIZE / (img.naturalHeight || SIZE))
    const w = (img.naturalWidth || SIZE) * scale
    const h = (img.naturalHeight || SIZE) * scale
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
    return canvas.toDataURL('image/png')
  }

  ctx.fillStyle = spec.kind === 'builtin' ? spec.color : letterColor(spec.hue)
  ctx.beginPath()
  ctx.roundRect(0, 0, SIZE, SIZE, RADIUS)
  ctx.fill()

  if (spec.kind === 'builtin') {
    const markup = renderToStaticMarkup(
      createElement(BUILTIN_ICONS[spec.name], { size: 40, color: '#ffffff', strokeWidth: 2 })
    )
    const glyph = await loadImage(svgDataUrl(markup))
    ctx.drawImage(glyph, 12, 12, 40, 40)
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 38px ui-sans-serif, system-ui, 'Segoe UI', sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(spec.letter, SIZE / 2, SIZE / 2 + 2)
  }
  return canvas.toDataURL('image/png')
}
