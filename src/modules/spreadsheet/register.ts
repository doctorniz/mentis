import type { FileTypeDefinition } from '@/core/registries/file-types'

const definition: FileTypeDefinition = {
  id: 'spreadsheet',
  label: 'Spreadsheet',
  suffixes: ['.xlsx', '.xls', '.csv'],
}

export default definition
