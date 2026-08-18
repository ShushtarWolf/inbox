import { inferImageUploadContentType, isAllowedImageUploadType } from '#shared/imageUpload.ts'

async function handleUpload(event: H3Event, folder: string) {
  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  const file = form.find((part) => part.name === 'file' && part.data)
  const contentType = file ? inferImageUploadContentType(file) : ''
  if (!file?.data || !contentType || !isAllowedImageUploadType(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  const url = await uploadImage(Buffer.from(file.data), { folder, contentType })
  return { url }
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return handleUpload(event, `uploads/${user.role.toLowerCase()}/${user.id}`)
})
