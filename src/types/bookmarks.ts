export interface BookmarkFrontmatter {
  url: string
  title: string
  description: string
  favicon: string
  ogImage: string
  tags: string[]
  created: string
  modified: string
  [key: string]: unknown
}

export interface BookmarkItem {
  path: string
  url: string
  title: string
  description: string
  favicon: string
  ogImage: string
  tags: string[]
  category: string | null
  created: string
  modified: string
}
