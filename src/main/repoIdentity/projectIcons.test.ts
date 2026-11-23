import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readGodotIcon, readUnityIcons } from './projectIcons'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cc-project-icons-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function put(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

const meta = (guid: string): string => `fileFormatVersion: 2\nguid: ${guid}\nTextureImporter:\n  serializedVersion: 12\n`

const DEFAULT_GUID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const STANDALONE_GUID = 'ffeeddccbbaa99887766554433221100'

function projectSettings(iconsBlock: string): string {
  return [
    '%YAML 1.1',
    '--- !u!129 &1',
    'PlayerSettings:',
    '  productName: Test',
    iconsBlock,
    '  m_BuildTargetBatching: []',
    ''
  ].join('\n')
}

describe('readUnityIcons', () => {
  it('finds the default icon’s texture through the .meta that holds its guid, then the build-target ones', async () => {
    put(
      'ProjectSettings/ProjectSettings.asset',
      projectSettings(
        [
          '  m_BuildTargetIcons:',
          '  - m_BuildTarget: Standalone',
          '    m_Icons:',
          '    - serializedVersion: 2',
          `      m_Icon: {fileID: 2800000, guid: ${STANDALONE_GUID}, type: 3}`,
          '      m_Width: 128',
          '  - m_BuildTarget: ',
          '    m_Icons:',
          '    - serializedVersion: 2',
          `      m_Icon: {fileID: 2800000, guid: ${DEFAULT_GUID}, type: 3}`,
          '      m_Width: 128'
        ].join('\n')
      )
    )
    put('Assets/Art/UI/AppIcon.png', 'png')
    put('Assets/Art/UI/AppIcon.png.meta', meta(DEFAULT_GUID))
    put('Assets/Art/Standalone.png', 'png')
    put('Assets/Art/Standalone.png.meta', meta(STANDALONE_GUID))
    put('Assets/Art/Other.png.meta', meta('0123456789abcdef0123456789abcdef'))

    expect(await readUnityIcons(root)).toEqual(['Assets/Art/UI/AppIcon.png', 'Assets/Art/Standalone.png'])
  })

  it('reads platform icon textures too', async () => {
    put(
      'ProjectSettings/ProjectSettings.asset',
      projectSettings(
        [
          '  m_BuildTargetIcons: []',
          '  m_BuildTargetPlatformIcons:',
          '  - m_BuildTarget: Android',
          '    m_Icons:',
          '    - m_Textures:',
          `      - {fileID: 2800000, guid: ${DEFAULT_GUID}, type: 3}`,
          '      m_Width: 192'
        ].join('\n')
      )
    )
    put('Assets/Icon.png', 'png')
    put('Assets/Icon.png.meta', meta(DEFAULT_GUID))
    expect(await readUnityIcons(root)).toEqual(['Assets/Icon.png'])
  })

  it('is empty when no icon is set, the texture is gone, or the folder is no Unity project', async () => {
    expect(await readUnityIcons(root)).toEqual([])
    put('ProjectSettings/ProjectSettings.asset', projectSettings('  m_BuildTargetIcons: []\n  m_BuildTargetPlatformIcons: []'))
    expect(await readUnityIcons(root)).toEqual([])
    put(
      'ProjectSettings/ProjectSettings.asset',
      projectSettings(['  m_BuildTargetIcons:', '  - m_BuildTarget: ', '    m_Icons:', `      m_Icon: {fileID: 2800000, guid: ${DEFAULT_GUID}, type: 3}`].join('\n'))
    )
    put('Assets/Gone.png.meta', meta(DEFAULT_GUID))
    expect(await readUnityIcons(root)).toEqual([])
  })
})

describe('readGodotIcon', () => {
  it('reads config/icon from the application section', async () => {
    put('project.godot', 'config_version=5\n\n[application]\n\nconfig/name="Game"\nconfig/icon="res://art/icon.svg"\n\n[rendering]\n')
    put('art/icon.svg', '<svg/>')
    expect(await readGodotIcon(root)).toBe('art/icon.svg')
  })

  it('is null without a project file, an icon line or the icon file', async () => {
    expect(await readGodotIcon(root)).toBeNull()
    put('project.godot', '[application]\nconfig/name="Game"\n')
    expect(await readGodotIcon(root)).toBeNull()
    put('project.godot', '[application]\nconfig/icon="res://missing.png"\n')
    expect(await readGodotIcon(root)).toBeNull()
  })

  it('ignores an icon key outside the application section', async () => {
    put('project.godot', '[other]\nconfig/icon="res://icon.png"\n')
    put('icon.png', 'png')
    expect(await readGodotIcon(root)).toBeNull()
  })
})
