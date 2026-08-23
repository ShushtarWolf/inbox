import { sniffImageUploadContentType, isAllowedImageUploadType } from '#shared/imageUpload.ts'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'uploads:guest')
  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  const file = form.find((part) => part.name === 'file' && part.data)
  // Magic-byte sniff only — never trust client Content-Type / filename for public uploads.
  const contentType = file?.data ? sniffImageUploadContentType(file.data) : ''
  if (!file?.data || !contentType || !isAllowedImageUploadType(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  const url = await uploadImage(Buffer.from(file.data), { folder: 'guest', contentType })
  return { url }
})
