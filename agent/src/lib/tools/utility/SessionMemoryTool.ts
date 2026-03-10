import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolSuccess, toolError, type ToolOutput } from '@/lib/tools/tool.interface'
import { StorageManager } from '@/lib/runtime/StorageManager'
import { PubSub } from '@/lib/pubsub'

// Storage key for session memory
const MEMORY_KEY = 'session_memory'

// Max number of memory entries to keep
const MAX_MEMORY_ENTRIES = 50

// Schema for a single memory entry
const MemoryEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
  category: z.string().default('general'),
  savedAt: z.number()
})

type MemoryEntry = z.infer<typeof MemoryEntrySchema>
type MemoryStore = Record<string, MemoryEntry>

// Input schema
const SessionMemoryInputSchema = z.object({
  action: z.enum(['remember', 'recall', 'recall_all', 'forget', 'forget_all'])
    .describe('Operation: remember stores a fact, recall retrieves by key, recall_all lists everything, forget removes a key, forget_all clears memory.'),
  key: z.string().optional()
    .describe('The memory key (short identifier like "preferred_language" or "user_name"). Required for remember/recall/forget.'),
  value: z.string().optional()
    .describe('The value to remember. Required for remember action.'),
  category: z.string().optional()
    .describe('Optional category to group related memories (e.g. "preferences", "credentials_hint", "tasks").')
})

type SessionMemoryInput = z.infer<typeof SessionMemoryInputSchema>

/**
 * SessionMemoryTool - Persistent cross-session AI memory.
 * Lets the agent remember facts about the user, their preferences, and ongoing context
 * across browser sessions. Stored in chrome.storage.local.
 */
export class SessionMemoryTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: SessionMemoryInput): Promise<ToolOutput> {
    switch (input.action) {
      case 'remember':    return this._remember(input)
      case 'recall':      return this._recall(input)
      case 'recall_all':  return this._recallAll(input)
      case 'forget':      return this._forget(input)
      case 'forget_all':  return this._forgetAll()
      default:
        return toolError(`Unknown action: ${(input as any).action}`)
    }
  }

  private async _load(): Promise<MemoryStore> {
    const raw = await StorageManager.get(MEMORY_KEY)
    if (!raw || typeof raw !== 'object') return {}
    return raw as MemoryStore
  }

  private async _save(store: MemoryStore): Promise<void> {
    await StorageManager.set(MEMORY_KEY, store)
  }

  private async _remember(input: SessionMemoryInput): Promise<ToolOutput> {
    if (!input.key) return toolError('key is required for remember action')
    if (!input.value) return toolError('value is required for remember action')

    this.executionContext.getPubSub().publishMessage(
      PubSub.createMessage(`Remembering: ${input.key}…`, 'thinking')
    )

    const store = await this._load()

    // Evict oldest entries if at cap
    const keys = Object.keys(store)
    if (keys.length >= MAX_MEMORY_ENTRIES && !store[input.key]) {
      const oldest = keys.sort((a, b) => store[a].savedAt - store[b].savedAt)[0]
      delete store[oldest]
    }

    store[input.key] = {
      key: input.key,
      value: input.value,
      category: input.category ?? 'general',
      savedAt: Date.now()
    }

    await this._save(store)
    return toolSuccess(`Remembered: ${input.key} = "${input.value}"`)
  }

  private async _recall(input: SessionMemoryInput): Promise<ToolOutput> {
    if (!input.key) return toolError('key is required for recall action')

    const store = await this._load()
    const entry = store[input.key]

    if (!entry) {
      return toolSuccess(`No memory found for key: ${input.key}`)
    }

    const date = new Date(entry.savedAt).toLocaleString()
    return toolSuccess(`**${entry.key}** (${entry.category}, saved ${date}): ${entry.value}`)
  }

  private async _recallAll(input: SessionMemoryInput): Promise<ToolOutput> {
    const store = await this._load()
    const entries = Object.values(store)

    if (entries.length === 0) {
      return toolSuccess('No memories stored yet.')
    }

    // Filter by category if provided
    const filtered = input.category
      ? entries.filter(e => e.category === input.category)
      : entries

    if (filtered.length === 0) {
      return toolSuccess(`No memories found in category: ${input.category}`)
    }

    // Group by category
    const groups: Record<string, MemoryEntry[]> = {}
    for (const entry of filtered) {
      if (!groups[entry.category]) groups[entry.category] = []
      groups[entry.category].push(entry)
    }

    const lines: string[] = [`**Session Memory (${filtered.length} entries):**`, '']
    for (const [category, categoryEntries] of Object.entries(groups)) {
      lines.push(`**${category.toUpperCase()}**`)
      for (const e of categoryEntries.sort((a, b) => b.savedAt - a.savedAt)) {
        lines.push(`  • ${e.key}: ${e.value}`)
      }
      lines.push('')
    }

    return toolSuccess(lines.join('\n'))
  }

  private async _forget(input: SessionMemoryInput): Promise<ToolOutput> {
    if (!input.key) return toolError('key is required for forget action')

    const store = await this._load()

    if (!store[input.key]) {
      return toolSuccess(`No memory found for key: ${input.key}`)
    }

    delete store[input.key]
    await this._save(store)
    return toolSuccess(`Forgotten: ${input.key}`)
  }

  private async _forgetAll(): Promise<ToolOutput> {
    await this._save({})
    return toolSuccess('All session memories cleared.')
  }
}

export function createSessionMemoryTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const tool = new SessionMemoryTool(executionContext)

  return new DynamicStructuredTool({
    name: 'session_memory_tool',
    description: `Persistent cross-session memory for the AI agent. Stores and retrieves facts about the user, their preferences, and ongoing context.
Memory survives across browser sessions. Use this to:
- remember: store a key-value fact (e.g. key="preferred_language", value="Spanish")
- recall: retrieve a specific memory by key
- recall_all: list all stored memories, optionally filtered by category
- forget: delete a specific memory key
- forget_all: clear all memories
Categories help organize memories (e.g. "preferences", "tasks", "user_info").`,
    schema: SessionMemoryInputSchema,
    func: async (args: SessionMemoryInput): Promise<string> => {
      const result = await tool.execute(args)
      return JSON.stringify(result)
    }
  })
}
