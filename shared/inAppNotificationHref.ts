/** Deep links for in-app notification rows (owner / athlete panels). */
export function inAppNotificationHref(
  type: string,
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (metadata && typeof metadata.href === 'string' && metadata.href.startsWith('/')) {
    return metadata.href
  }
  if (type === 'DISCOUNT_APPLICATION') return '/owner/discounts?tab=requests'
  return null
}