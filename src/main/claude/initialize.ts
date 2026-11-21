import type { CliAccount, CliCommand, CliModel, SessionInit } from '../../shared/types'
import { isRecord } from './controlChannel'

type Raw = Record<string, unknown>

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function records(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function toModel(raw: Raw): CliModel | null {
  const value = text(raw.value)
  if (!value) return null
  const levels = Array.isArray(raw.supportedEffortLevels)
    ? raw.supportedEffortLevels.filter((l): l is string => typeof l === 'string')
    : []
  return {
    value,
    resolvedModel: text(raw.resolvedModel) ?? value,
    displayName: text(raw.displayName) ?? value,
    description: text(raw.description) ?? '',
    supportsEffort: raw.supportsEffort === true,
    supportedEffortLevels: levels,
    supportsAutoMode: raw.supportsAutoMode === true
  }
}

function toAccount(raw: unknown): CliAccount | null {
  if (!isRecord(raw)) return null
  const account: CliAccount = {}
  for (const key of ['email', 'organization', 'subscriptionType', 'apiProvider'] as const) {
    const value = text(raw[key])
    if (value !== undefined) account[key] = value
  }
  return account
}

function toCommand(raw: Raw): CliCommand | null {
  const name = text(raw.name)
  if (!name) return null
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.filter((a): a is string => typeof a === 'string') : []
  return {
    name,
    description: text(raw.description) ?? '',
    argumentHint: text(raw.argumentHint) ?? '',
    aliases,
    builtin: raw.builtin === true
  }
}

/** Narrows the CLI's `initialize` reply to what the app keeps. */
export function parseInitialize(response: Raw): SessionInit {
  return {
    models: records(response.models)
      .map(toModel)
      .filter((m): m is CliModel => m !== null),
    account: toAccount(response.account),
    commands: records(response.commands)
      .map(toCommand)
      .filter((c): c is CliCommand => c !== null),
    permissionMode: text(response.current_permission_mode) ?? 'default'
  }
}
