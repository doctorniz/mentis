/** Same frontmatter the New menu has always written. */
export default function createNote({ title }: { title: string }): string {
  return `---\ntitle: "${title}"\ndate: "${new Date().toISOString()}"\ntags: []\n---\n\n`
}
