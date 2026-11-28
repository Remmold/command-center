import { shell } from 'electron'
import { model3dJobsFolder } from '../util/paths'
import { realModel3dPorts } from './adapters'
import { model3dConfig } from './config'
import { createModel3dService, type Model3dService } from './service'

/** The variables a hosted session needs so its gen3d.py finds the jobs folder and says which session asked. */
export function model3dSessionEnv(jobsFolder: string, sessionId: string): Record<string, string> {
  return { CC_MODEL3D_JOBS: jobsFolder, CC_SESSION_ID: sessionId }
}

/** Starts the app's 3D service on the real engine, or the fakes the env points at. */
export function startModel3dService(): Model3dService {
  const config = model3dConfig(process.env, model3dJobsFolder())
  const service = createModel3dService(realModel3dPorts(config, (url) => shell.openExternal(url)), {
    folder: config.folder,
    pid: process.pid,
    clusterProcesses: config.clusterProcesses,
    unityProcesses: config.unityProcesses,
    serverLog: config.serverLog
  })
  service.start().catch((err) => console.error('[model3d] start failed', err))
  return service
}
