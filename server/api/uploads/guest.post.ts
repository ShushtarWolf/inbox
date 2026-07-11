export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'uploads:guest')
  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  const file = form.find((part) => part.name === 'file' && part.data)
  if (!file?.data || !file.type) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  const url = await uploadImage(Buffer.from(file.data), { folder: 'uploads/guest', contentType: file.type })
  return { url }
})
