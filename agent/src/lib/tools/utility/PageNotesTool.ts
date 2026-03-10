import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolSuccess, toolError, type ToolOutput } from '@/lib/tools/tool.interface'
import { StorageManager } from '@/lib/runtime/StorageManager'
import { PubSub } from '@/lib/pubsub'

// Storage key prefix for page notes
const NOTES_STORAGE_KEY = 'page_notes'

// Schema for a single note entry
const NoteEntrySchema = z.object({
  url: z.string(),
  title: z.string(),
  note: z.string(),
  savedAt: z.number()
})

type NoteEntry = z.infer<typeof NoteEntrySchema>
type NotesMap = Record<string, NoteEntry>

// Input schema
const PageNotesInputSchema = z.object({
  action: z.enum(['save', 'get', 'list', 'delete'])
    .describe('Operation: save a note for a URL, get the note for a URL, list all saved notes, or delete a note.'),
  url: z.string().optional()
    .describe('The page URL to associate the note with. Required for save/get/delete actions.'),
  note: z.string().optional()
    .describe('The note content to save. Required for the save action.'),
  title: z.string().optional()
    .describe('Optional page title for context when saving.')
})

type PageNotesInput = z.infer<typeof PageNotesInputSchema>

/**
 * PageNotesTool - Save, retrieve, list, and delete per-URL persistent notes.
 * Notes are stored in chrome.storage.local and survive across sessions.
 */
export class PageNotesTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: PageNotesInput): Promise<ToolOutput> {
    switch (input.action) {
      case 'save':   return this._save(input)
      case 'get':    return this._get(input)
      case 'list':   return this._list()
      case 'delete': return this._delete(input)
      default:
        return toolError(`Unknown action: ${(input as any).action}`)
    }
  }

  private async _loadNotes(): Promise<NotesMap> {
    const raw = await StorageManager.get(NOTES_STORAGE_KEY)
    if (!raw || typeof raw !== 'object') return {}
    return raw as NotesMap
  }

  private async _saveNotes(notes: NotesMap): Promise<void> {
    await StorageManager.set(NOTES_STORAGE_KEY, notes)
  }

  private async _save(input: PageNotesInput): Promise<ToolOutput> {
    if (!input.url) return toolError('url is required for save action')
    if (!input.note) return toolError('note is required for save action')

    this.executionContext.getPubSub().publishMessage(
      PubSub.createMessage(`Saving note for ${input.url}…`, 'thinking')
    )

    const notes = await this._loadNotes()
    const key = this._normalizeUrl(input.url)
    notes[key] = {
      url: input.url,
      title: input.title ?? input.url,
      note: input.note,
      savedAt: Date.now()
    }
    await this._saveNotes(notes)
    return toolSuccess(`Note saved for "${input.title ?? input.url}"`)
  }

  private async _get(input: PageNotesInput): Promise<ToolOutput> {
    if (!input.url) return toolError('url is required for get action')

    const notes = await this._loadNotes()
    const key = this._normalizeUrl(input.url)
    const entry = notes[key]

    if (!entry) {
      return toolSuccess(`No note found for ${input.url}`)
    }

    const date = new Date(entry.savedAt).toLocaleString()
    return toolSuccess(`**Note for "${entry.title}"** (saved ${date}):\n\n${entry.note}`)
  }

  private async _list(): Promise<ToolOutput> {
    const notes = await this._loadNotes()
    const entries = Object.values(notes)

    if (entries.length === 0) {
      return toolSuccess('No page notes saved yet.')
    }

    // Sort by most recently saved first
    entries.sort((a, b) => b.savedAt - a.savedAt)

    const lines = entries.map((e, i) => {
      const date = new Date(e.savedAt).toLocaleDateString()
      return `${i + 1}. **${e.title}** (${date})\n   ${e.url}\n   ${e.note.slice(0, 100)}${e.note.length > 100 ? '…' : ''}`
    })

    return toolSuccess(`**Saved Page Notes (${entries.length}):**\n\n${lines.join('\n\n')}`)
  }

  private async _delete(input: PageNotesInput): Promise<ToolOutput> {
    if (!input.url) return toolError('url is required for delete action')

    const notes = await this._loadNotes()
    const key = this._normalizeUrl(input.url)

    if (!notes[key]) {
      return toolSuccess(`No note found for ${input.url}`)
    }

    const title = notes[key].title
    delete notes[key]
    await this._saveNotes(notes)
    return toolSuccess(`Note deleted for "${title}"`)
  }

  /** Normalize URL by stripping trailing slash and fragment */
  private _normalizeUrl(url: string): string {
    try {
      const u = new URL(url)
      u.hash = ''
      return u.toString().replace(/\/$/, '')
    } catch {
      return url.replace(/\/$/, '')
    }
  }
}

export function createPageNotesTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const tool = new PageNotesTool(executionContext)

  return new DynamicStructuredTool({
    name: 'page_notes_tool',
    description: `Save, retrieve, list, and delete persistent notes associated with web page URLs.
Notes survive across browser sessions. Use this to:
- save: attach a note to the current page URL
- get: retrieve the note for a specific URL
- list: show all saved notes
- delete: remove the note for a specific URL`,
    schema: PageNotesInputSchema,
    func: async (args: PageNotesInput): Promise<string> => {
      const result = await tool.execute(args)
      return JSON.stringify(result)
    }
  })
}
