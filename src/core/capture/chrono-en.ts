/**
 * The one part of chrono-node capture uses: casual English parsing. Imported
 * statically here so the bundler drops the other locales; ./dates loads this
 * module on demand. (chrono-node's `chrono-node/en` subpath does not resolve
 * under Vite, which cannot read its wildcard `exports` map.)
 */
export { parse } from 'chrono-node'
