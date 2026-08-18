import { afterEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_UPLOAD_MAX_BYTES } from './imageUpload'
import {
  fittedImageSize,
  IMAGE_PREPARE_LONG_EDGE_PX,
  preparedImageFileName,
  prepareImageForUpload,
} from './prepareImageUpload'

vi.mock('heic-to', () => ({
  heicTo: vi.fn(),
}))

describe('fittedImageSize', () => {
  it('keeps images already within the long-edge cap', () => {
    expect(fittedImageSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('scales the long edge to ~1920px', () => {
    expect(fittedImageSize(4000, 3000)).toEqual({ width: 1920, height: 1440 })
    expect(fittedImageSize(3000, 4000)).toEqual({ width: 1440, height: 1920 })
  })
})

describe('preparedImageFileName', () => {
  it('prefers webp then jpeg fallback', () => {
    expect(preparedImageFileName('image/webp')).toBe('photo.webp')
    expect(preparedImageFileName('image/jpeg')).toBe('photo.jpg')
  })
})

describe('prepareImageForUpload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function stubCanvas(blobFor: (type: string) => Blob | null) {
    vi.stubGlobal('document', {
      createElement(tag: string) {
        if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`)
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => {} }),
          toBlob: (cb: (blob: Blob | null) => void, type?: string) => {
            cb(blobFor(type || ''))
          },
        }
      },
    })
  }

  it('exports webp under the server cap', async () => {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    stubCanvas((type) => (type === 'image/webp'
      ? new Blob([new Uint8Array(1200)], { type: 'image/webp' })
      : null))

    const file = new File([new Uint8Array(8000)], 'shot.jpg', { type: 'image/jpeg' })
    const prepared = await prepareImageForUpload(file)
    expect(prepared.type).toBe('image/webp')
    expect(prepared.name).toBe('photo.webp')
    expect(prepared.size).toBeLessThanOrEqual(IMAGE_UPLOAD_MAX_BYTES)
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('falls back to jpeg when webp toBlob is unsupported', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 640,
      height: 480,
      close: vi.fn(),
    })))
    stubCanvas((type) => (type === 'image/jpeg'
      ? new Blob([new Uint8Array(900)], { type: 'image/jpeg' })
      : null))

    const prepared = await prepareImageForUpload(
      new File([new Uint8Array(400)], 'a.png', { type: 'image/png' }),
    )
    expect(prepared.type).toBe('image/jpeg')
    expect(prepared.name).toBe('photo.jpg')
  })

  it('uses heic-to when createImageBitmap fails for HEIC', async () => {
    const bitmap = { width: 100, height: 80, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      throw new Error('HEIC decode failed')
    }))
    const { heicTo } = await import('heic-to')
    vi.mocked(heicTo).mockResolvedValue(bitmap as never)
    stubCanvas(() => new Blob([new Uint8Array(200)], { type: 'image/webp' }))

    const prepared = await prepareImageForUpload(
      new File([new Uint8Array(300)], 'IMG_1.HEIC', { type: 'image/heic' }),
    )
    expect(heicTo).toHaveBeenCalled()
    expect(prepared.type).toBe('image/webp')
    expect(IMAGE_PREPARE_LONG_EDGE_PX).toBe(1920)
  })

  it('retries createImageBitmap without from-image when orientation option fails', async () => {
    const bitmap = { width: 640, height: 480, close: vi.fn() }
    const createImageBitmap = vi.fn()
      .mockRejectedValueOnce(new Error('invalid enum from-image'))
      .mockResolvedValueOnce(bitmap)
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    stubCanvas(() => new Blob([new Uint8Array(200)], { type: 'image/webp' }))

    const prepared = await prepareImageForUpload(
      new File([new Uint8Array(400)], 'shot.jpg', { type: 'image/jpeg' }),
    )
    expect(createImageBitmap).toHaveBeenCalledTimes(2)
    expect(createImageBitmap.mock.calls[0][1]).toEqual({ imageOrientation: 'from-image' })
    expect(createImageBitmap.mock.calls[1]).toHaveLength(1)
    expect(prepared.type).toBe('image/webp')
  })

  it('uses heic-to for mislabeled iPhone HEIC (jpeg type, ftyp header)', async () => {
    const heicHead = new Uint8Array(12)
    heicHead.set([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])
    const file = new File([heicHead], 'IMG_0001.JPG', { type: 'image/jpeg' })
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      throw new Error('decode failed')
    }))
    const bitmap = { width: 120, height: 90, close: vi.fn() }
    const { heicTo } = await import('heic-to')
    vi.mocked(heicTo).mockResolvedValue(bitmap as never)
    stubCanvas(() => new Blob([new Uint8Array(200)], { type: 'image/webp' }))

    const prepared = await prepareImageForUpload(file)
    expect(heicTo).toHaveBeenCalled()
    expect(prepared.type).toBe('image/webp')
  })
})
