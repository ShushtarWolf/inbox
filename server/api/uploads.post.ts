async function handleUpload(event: H3Event, folder: string) {
  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  const file = form.find((part) => part.name === 'file' && part.data)
  if (!file?.data || !file.type) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  const url = await uploadImage(Buffer.from(file.data), { folder, contentType: file.type })
  return { url }
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return handleUpload(event, `uploads/${user.role.toLowerCase()}/${user.id}`)
})
