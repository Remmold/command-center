import { join } from 'node:path'

/** Where the 3D service finds the engine and the coord board; each has an env override so e2e can point at fakes. */
export interface Model3dConfig {
  folder: string
  engineDir: string
  enginePython: string
  port: number
  coordScript: string
  clusterProcesses: string[]
  unityProcesses: string[]
  serverLog: string
  /** e2e only: the editor's URL is appended here instead of opening a browser. */
  browserLog: string | null
  /** e2e only: a folder whose gen3d.py a request may run, besides the model3d skill's. */
  extraScripts: string | null
}

export const MODEL3D_ENV = {
  engineDir: 'CC_MODEL3D_ENGINE_DIR',
  enginePython: 'CC_MODEL3D_ENGINE_PYTHON',
  port: 'CC_MODEL3D_PORT',
  coordScript: 'CC_MODEL3D_COORD',
  clusterProcesses: 'CC_MODEL3D_CLUSTER_PROCESSES',
  unityProcesses: 'CC_MODEL3D_UNITY_PROCESSES',
  browserLog: 'CC_MODEL3D_BROWSER_LOG',
  extraScripts: 'CC_MODEL3D_SCRIPTS'
} as const

const list = (value: string | undefined, fallback: string[]): string[] => {
  const names = (value ?? '').split(',').map((n) => n.trim()).filter(Boolean)
  return value === undefined ? fallback : names
}

export function model3dConfig(env: Record<string, string | undefined>, folder: string): Model3dConfig {
  const engineDir = env[MODEL3D_ENV.engineDir] || 'C:\\ComfyUI3D'
  const port = Number(env[MODEL3D_ENV.port])
  return {
    folder,
    engineDir,
    enginePython: env[MODEL3D_ENV.enginePython] || join(engineDir, '.venv', 'Scripts', 'python.exe'),
    port: Number.isInteger(port) && port > 0 ? port : 8189,
    coordScript: env[MODEL3D_ENV.coordScript] || 'C:\\dfst_coord\\coord.py',
    clusterProcesses: list(env[MODEL3D_ENV.clusterProcesses], ['SFGamelogicServer.exe', 'SFGamelogicDistributor.exe']),
    unityProcesses: list(env[MODEL3D_ENV.unityProcesses], ['Unity.exe']),
    serverLog: join(engineDir, 'server.log'),
    browserLog: env[MODEL3D_ENV.browserLog] || null,
    extraScripts: env[MODEL3D_ENV.extraScripts] || null
  }
}
