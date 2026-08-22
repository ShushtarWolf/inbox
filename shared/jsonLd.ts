/**
 * Serialize JSON-LD for embedding in a <script> tag.
 * Escapes `<` so a value like `</script><script>…` cannot break out of the element.
 */
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
