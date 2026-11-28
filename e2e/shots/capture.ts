import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { resize } from './seed'

/** A part of the page in CSS pixels, as `Locator.boundingBox()` gives it. */
export interface CssRect {
  x: number
  y: number
  width: number
  height: number
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.toString('latin1', 1, 4) !== 'PNG' || png.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/**
 * Writes the window of `page` as a PNG, painted by Electron itself: Playwright's page screenshot covers only the CSS
 * viewport, which a zoomed page (110% by default) makes smaller than the window, so it cropped the right and bottom.
 * With `rect`, only that part of the page. Asserts the PNG is exactly the window's content size (or the rect's) in
 * device pixels, so a crop fails the run.
 */
export async function captureWindow(app: ElectronApplication, page: Page, path: string, rect?: CssRect): Promise<{ width: number; height: number }> {
  const id = await (await app.browserWindow(page)).evaluate((win) => win.id)
  const shot = await app.evaluate(
    async ({ BrowserWindow, screen }, [windowId, part]) => {
      const win = BrowserWindow.fromId(windowId)
      if (!win) throw new Error(`no window ${windowId}`)
      const zoom = win.webContents.getZoomFactor()
      const area = part && { x: Math.round(part.x * zoom), y: Math.round(part.y * zoom), width: Math.round(part.width * zoom), height: Math.round(part.height * zoom) }
      const image = await (area ? win.webContents.capturePage(area) : win.webContents.capturePage())
      const [width, height] = area ? [area.width, area.height] : win.getContentSize()
      return { png: image.toPNG().toString('base64'), width, height, scale: screen.getDisplayMatching(win.getBounds()).scaleFactor }
    },
    [id, rect ?? null] as const
  )
  const png = Buffer.from(shot.png, 'base64')
  const size = pngSize(png)
  expect(size, `${path} is the whole ${rect ? 'part' : 'window'}`).toEqual({ width: Math.round(shot.width * shot.scale), height: Math.round(shot.height * shot.scale) })
  writeFileSync(path, png)
  return size
}

/** The window sizes every view is shot at, labelled by width for the `<prefix>-<view>-<width>.png` names. */
const SIZES = [['1440', 1440, 900], ['1100', 1100, 800]] as const

/** Shoots the window at each size, as `<prefix>-<name>-<width>.png` in `dir`. */
export async function shootSizes(app: ElectronApplication, page: Page, dir: string, prefix: string, name: string): Promise<void> {
  for (const [label, w, h] of SIZES) {
    await resize(app, w, h)
    await page.waitForTimeout(400)
    await captureWindow(app, page, join(dir, `${prefix}-${name}-${label}.png`))
  }
}
