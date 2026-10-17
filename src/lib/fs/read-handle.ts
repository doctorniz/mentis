/**
 * Read a browser file handle. A `File` taken from a handle goes stale when the
 * file is written meanwhile, and reading it then fails with NotReadableError
 * (one view saving a file another view is opening). Take a fresh `File` and
 * read again, a few times, before giving up.
 */
export async function readHandle<T>(
  handle: FileSystemFileHandle,
  read: (file: File) => Promise<T>,
  attempts = 5,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read(await handle.getFile())
    } catch (err) {
      const stale = err instanceof DOMException && err.name === 'NotReadableError'
      if (!stale || attempt >= attempts) throw err
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt))
    }
  }
}
