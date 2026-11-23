import { describe, expect, it } from 'vitest'
import { engineIconReferences } from './engineDefaults'

describe('engine icon references', () => {
  it('names the Unity crash handler beside a Unity player build', () => {
    expect(
      engineIconReferences(['Game.exe', 'UnityPlayer.dll', 'UnityCrashHandler64.exe', 'Game_Data', 'D3D12'])
    ).toEqual(['UnityCrashHandler64.exe'])
  })

  it('matches the Unity file names in any case and the 32-bit crash handler', () => {
    expect(engineIconReferences(['game.exe', 'unityplayer.dll', 'unitycrashhandler32.exe'])).toEqual(['unitycrashhandler32.exe'])
  })

  it('names nothing outside a Unity build', () => {
    expect(engineIconReferences(['RiseOfAgon.exe', 'UnityCrashHandler64.exe'])).toEqual([])
    expect(engineIconReferences(['Game.exe', 'UnityPlayer.dll'])).toEqual([])
  })
})
