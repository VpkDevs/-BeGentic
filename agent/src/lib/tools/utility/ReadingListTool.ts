import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolSuccess, toolError, type ToolOutput } from '@/lib/tools/tool.interface'
import { StorageManager } from '@/lib/runtime/StorageManager'
import { PubSub } from '@/lib/pubsub'

// Storage key
const READING_LIST_KEY = 'reading_list'

// Max items in the reading list
const MAX_ITEMS = 200

// Schema for a single reading list item
const ReadingListItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  excerpt: z.string().default(''),
  tags: z.array(z.string()).default([]),
  isRead: z.boolean().default(false),
  savedAt: z.number(),
  readAt: z.number().nullable().default(null)
})

type ReadingListItem = z.infer<typeof ReadingListItemSchema>
type ReadingList = ReadingListItem[]

// Input schema
const ReadingListInputSchema = z.object({
  action: z.enum(['add', 'list', 'mark_read', 'remove', 'clear_read'])
    .describe('Operation: add saves a page, list shows saved pages, mark_read marks an item as read, remove deletes an item, clear_read removes all read items.'),
  url: z.string().optional()
    .describe('The page URL. Required for add/mark_read/remove.'),
  title: z.string().optional()
    .describe('Page title. Used when adding an item.'),
  excerpt: z.string().optional()
    .describe('Brief excerpt or description. Used when adding an item.'),
  tags: z.array(z.string()).optional()
    .describe('Optional tags for categorization (e.g. ["ai", "research"]).'),
  filter: z.enum(['all', 'unread', 'read']).default('unread')
    .describe('Filter for list action: all, unread (default), or read.')
})

type ReadingListInput = z.infer<typeof ReadingListInputSchema>

/**
 * ReadingListTool - Save articles and pages to a persistent reading list.
 * Supports tagging, read/unread tracking, and filtering.
 */
export class ReadingListTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: ReadingListInput): Promise<ToolOutput> {
    switch (input.action) {
      case 'add':        return this._add(input)
      case 'list':       return this._list(input)
      case 'mark_read':  return this._markRead(input)
      case 'remove':     return this._remove(input)
      case 'clear_read': return this._clearRead()
      default:
        return toolError(`Unknown action: ${(input as any).action}`)
    }
  }

  private async _load(): Promise<ReadingList> {
    const raw = await StorageManager.get(READING_LIST_KEY)
    if (!Array.isArray(raw)) return []
    return raw as ReadingList
  }

  private async _store(list: ReadingList): Promise<void> {
    await StorageManager.set(READING_LIST_KEY, list)
  }

  private async _add(input: ReadingListInput): Promise<ToolOutput> {
    if (!input.url) return toolError('url is required for add action')

    this.executionContext.getPubSub().publishMessage(
      PubSub.createMessage(`Adding to reading list: ${input.title ?? input.url}…`, 'thinking')
    )

    const list = await this._load()

    // Check for duplicates
    if (list.some(item => item.url === input.url)) {
      return toolSuccess(`Already in reading list: "${input.title ?? input.url}"`)
    }

    // Enforce max items
    if (list.length >= MAX_ITEMS) {
      return toolError(`Reading list is full (${MAX_ITEMS} items). Remove some items first.`)
    }

    const newItem: ReadingListItem = {
      id: crypto.randomUUID(),
      url: input.url,
      title: input.title ?? input.url,
      excerpt: input.excerpt ?? '',
      tags: input.tags ?? [],
      isRead: false,
      savedAt: Date.now(),
      readAt: null
    }

    list.unshift(newItem)
    await this._store(list)

    const tagsStr = newItem.tags.length > 0 ? ` [${newItem.tags.join(', ')}]` : ''
    return toolSuccess(`Added to reading list: "${newItem.title}"${tagsStr}`)
  }

  private async _list(input: ReadingListInput): Promise<ToolOutput> {
    const list = await this._load()

    let items = list
    if (input.filter === 'unread') items = list.filter(i => !i.isRead)
    else if (input.filter === 'read') items = list.filter(i => i.isRead)

    if (items.length === 0) {
      const emptyMsg = input.filter === 'unread'
        ? 'No unread items in reading list.'
        : input.filter === 'read'
          ? 'No read items in reading list.'
          : 'Reading list is empty.'
      return toolSuccess(emptyMsg)
    }

    const lines: string[] = [
      `**Reading List (${items.length} ${input.filter} item${items.length !== 1 ? 's' : ''}):**`,
      ''
    ]

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const date = new Date(item.savedAt).toLocaleDateString()
      const readMark = item.isRead ? '✅ ' : '📖 '
      const tagsStr = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : ''
      lines.push(`${i + 1}. ${readMark}**[${item.title}](${item.url})**${tagsStr}`)
      if (item.excerpt) lines.push(`   ${item.excerpt}`)
      lines.push(`   Saved: ${date}`)
      lines.push('')
    }

    return toolSuccess(lines.join('\n'))
  }

  private async _markRead(input: ReadingListInput): Promise<ToolOutput> {
    if (!input.url) return toolError('url is required for mark_read action')

    const list = await this._load()
    const item = list.find(i => i.url === input.url)

    if (!item) return toolSuccess(`Item not found in reading list: ${input.url}`)

    item.isRead = true
    item.readAt = Date.now()
    await this._store(list)
    return toolSuccess(`Marked as read: "${item.title}"`)
  }

  private async _remove(input: ReadingListInput): Promise<ToolOutput> {
    if (!input.url) return toolError('url is required for remove action')

    const list = await this._load()
    const index = list.findIndex(i => i.url === input.url)

    if (index === -1) return toolSuccess(`Item not found in reading list: ${input.url}`)

    const title = list[index].title
    list.splice(index, 1)
    await this._store(list)
    return toolSuccess(`Removed from reading list: "${title}"`)
  }

  private async _clearRead(): Promise<ToolOutput> {
    const list = await this._load()
    const before = list.length
    const remaining = list.filter(i => !i.isRead)
    await this._store(remaining)
    const removed = before - remaining.length
    return toolSuccess(`Cleared ${removed} read item${removed !== 1 ? 's' : ''} from reading list.`)
  }
}

export function createReadingListTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const tool = new ReadingListTool(executionContext)

  return new DynamicStructuredTool({
    name: 'reading_list_tool',
    description: `Manage a persistent reading list of pages and articles.
Supports adding, listing, marking as read, and removing items.
Use this to:
- add: save a page URL to the reading list (with optional title, excerpt, tags)
- list: display saved pages (filter by all/unread/read)
- mark_read: mark a page as read
- remove: remove a page from the list
- clear_read: remove all read items
The reading list persists across browser sessions.`,
    schema: ReadingListInputSchema,
    func: async (args: ReadingListInput): Promise<string> => {
      const result = await tool.execute(args)
      return JSON.stringify(result)
    }
  })
}
