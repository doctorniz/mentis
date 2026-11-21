/**
 * A remote folder as written. An Android vault was once named after its encoded address
 * (`primary%3ATest%20Vaults`), and that name was saved as the sync folder: read it decoded.
 */
export function readableRemotePath(path: string | undefined): string {
  if (!path) return ''
  return path
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        return part
      }
    })
    .join('/')
}
