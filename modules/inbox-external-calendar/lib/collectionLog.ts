export type ExternalCollectionLogEvent =
  | 'adapter_fetch_start'
  | 'adapter_fetch_done'
  | 'booking_guard_start'
  | 'booking_guard_done'
  | 'booking_guard_blocked'

export function logExternalCollection(
  event: ExternalCollectionLogEvent,
  fields: Record<string, unknown>,
): void {
  console.log(JSON.stringify({
    tag: 'ext-cal',
    event,
    ts: new Date().toISOString(),
    ...fields,
  }))
}
