import type { Editor, Range } from '@tiptap/core'
import type { CommandDefinition } from '@/core/registries/commands'
import { getSlashDialogHandlers } from '@/lib/editor/slash-dialog-bridge'

declare module '@/core/registries/commands' {
  interface CommandScopes {
    /**
     * A markdown editor with focus. `range` is the text to replace: the
     * `/query` typed in the slash menu, or an empty range at the selection
     * when run from the palette, so the selection itself is kept.
     */
    'markdown-editor': { editor: Editor; range: Range }
  }
}

/** The editor's commands, in slash-menu order. */
const commands: CommandDefinition<'markdown-editor'>[] = [
  {
    id: 'markdown.heading-1',
    title: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'title', '#'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    id: 'markdown.heading-2',
    title: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', '##'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    id: 'markdown.heading-3',
    title: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3', '###'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    id: 'markdown.paragraph',
    title: 'Paragraph',
    description: 'Normal text',
    keywords: ['p', 'text'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run()
    },
  },
  {
    id: 'markdown.bullet-list',
    title: 'Bullet list',
    description: 'Unordered list',
    keywords: ['ul', 'list'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    id: 'markdown.numbered-list',
    title: 'Numbered list',
    description: 'Ordered list',
    keywords: ['ol', 'numbered'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    id: 'markdown.task-list',
    title: 'Task list',
    description: 'Checkboxes',
    keywords: ['todo', 'checkbox'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    id: 'markdown.quote',
    title: 'Quote',
    description: 'Blockquote',
    keywords: ['blockquote', 'citation'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    id: 'markdown.code-block',
    title: 'Code block',
    description: 'Fenced code',
    keywords: ['```', 'snippet'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    id: 'markdown.divider',
    title: 'Divider',
    description: 'Horizontal rule',
    keywords: ['hr', '---', 'line'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    id: 'markdown.image',
    title: 'Image',
    description: 'Upload or pick from vault',
    keywords: ['image', 'picture', 'photo', 'upload'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      getSlashDialogHandlers()?.openImageDialog()
    },
  },
  {
    id: 'markdown.video',
    title: 'Video',
    description: 'Upload or pick from vault',
    keywords: ['video', 'movie', 'clip', 'upload'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      getSlashDialogHandlers()?.openVideoDialog()
    },
  },
  {
    id: 'markdown.wiki-link',
    title: 'Wiki link',
    description: 'Link to another note  [[…]]',
    keywords: ['wiki', 'link', 'note', '[[', 'backlink'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      // Insert the trigger characters — the wiki-link Suggestion plugin
      // scans document text for `[[` and opens the same autocomplete a
      // user gets by typing it directly.
      editor.chain().focus().deleteRange(range).insertContent('[[').run()
    },
  },
  {
    id: 'markdown.template',
    title: 'Template',
    description: 'Insert a saved template',
    keywords: ['template', 'snippet', 'boilerplate'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      getSlashDialogHandlers()?.openTemplateDialog()
    },
  },
  {
    id: 'markdown.highlight',
    title: 'Highlight',
    description: 'Highlighted text  ==like this==',
    keywords: ['highlight', 'mark', '==', 'mark text'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHighlight().run()
    },
  },
  {
    id: 'markdown.table',
    title: 'Table',
    description: 'Insert a 3-column table',
    keywords: ['table', 'grid', 'rows', 'columns', 'spreadsheet'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
  {
    id: 'markdown.math-inline',
    title: 'Math (inline)',
    description: 'Inline LaTeX formula  $…$',
    keywords: ['math', 'latex', 'formula', 'equation', '$', 'katex'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'mathInline', attrs: { latex: '' } })
        .run()
    },
  },
  {
    id: 'markdown.math-block',
    title: 'Math block',
    description: 'Display LaTeX formula  $$…$$',
    keywords: ['math', 'latex', 'display', 'block', '$$', 'katex'],
    scope: 'markdown-editor',
    run: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'mathBlock', attrs: { latex: '' } })
        .run()
    },
  },
]

export default commands
