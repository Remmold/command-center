import { transcriptsDirForCwd } from '../profiles/transcripts'
import { AgentSweep } from './agentSweep'

export const agentSweep = new AgentSweep(transcriptsDirForCwd)
