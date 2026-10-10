import { emptyList, serializeList } from '@/lib/lists'

export default function createList(): string {
  return serializeList(emptyList('checklist'))
}
