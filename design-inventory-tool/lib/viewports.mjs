/** @typedef {'desktop' | 'mobile'} ViewportId */

export const VIEWPORTS = {
  desktop: {
    id: 'desktop',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent: undefined,
  },
  mobile: {
    id: 'mobile',
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
}

export function viewportContext(id) {
  const v = VIEWPORTS[id]
  return {
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.deviceScaleFactor,
    isMobile: v.isMobile,
    hasTouch: v.hasTouch,
    ...(v.userAgent ? { userAgent: v.userAgent } : {}),
  }
}
