import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'spreadsheet',
  label: 'Spreadsheet',
  suffixes: ['.xlsx', '.xls', '.csv'],
  editor: () => import('./editor'),
  layout: { narrow: 'wide' },
}

export default definition
