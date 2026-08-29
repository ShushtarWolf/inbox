import type { H3Event } from 'h3'
import { isPackagesEnabled, type PackagesGateOptions } from '#shared/packages.ts'

function mergeGateOptions(event?: H3Event): PackagesGateOptions | undefined {
  if (!event) return undefined
  try {
    const runtime = useRuntimeConfig(event).public as { packagesEnabled?: boolean }
    return { enabled: isPackagesEnabled() || Boolean(runtime?.packagesEnabled) }
  } catch {
    return undefined
  }
}

export function assertPackagesEnabled(event?: H3Event) {
  if (!isPackagesEnabled(mergeGateOptions(event))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'PACKAGES_DISABLED',
    })
  }
}

export function packagesEnabledForEvent(event?: H3Event): boolean {
  return isPackagesEnabled(mergeGateOptions(event))
}
