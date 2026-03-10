import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolSuccess, toolError, type ToolOutput } from '@/lib/tools/tool.interface'
import { PubSub } from '@/lib/pubsub'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { invokeWithRetry } from '@/lib/utils/retryable'

// Maximum number of history items to process
const MAX_HISTORY_ITEMS = 500

// Input schema
const HistorySearchInputSchema = z.object({
  query: z.string()
    .describe('Natural language query describing what to find in browsing history (e.g. "machine learning articles I read last week", "that Python tutorial", "news about climate change").'),
  max_results: z.number().int().min(1).max(20).default(10)
    .describe('Maximum number of results to return (1-20, default 10).'),
  days_back: z.number().int().min(1).max(90).default(30)
    .describe('How many days back to search (1-90, default 30).')
})

type HistorySearchInput = z.infer<typeof HistorySearchInputSchema>

const HistoryMatchSchema = z.object({
  url: z.string(),
  title: z.string(),
  relevance_reason: z.string(),
  visit_date: z.string()
})

const HistorySearchResultSchema = z.object({
  matches: z.array(HistoryMatchSchema),
  search_summary: z.string()
})

type HistorySearchResult = z.infer<typeof HistorySearchResultSchema>

/**
 * HistorySearchTool - Natural language search over browser history.
 * Fetches recent history entries and uses AI to find relevant matches.
 */
export class HistorySearchTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: HistorySearchInput): Promise<ToolOutput> {
    try {
      this.executionContext.getPubSub().publishMessage(
        PubSub.createMessage('Searching browsing history…', 'thinking')
      )

      // Calculate start time
      const startTime = Date.now() - input.days_back * 24 * 60 * 60 * 1000

      // Fetch history from Chrome
      const historyItems = await chrome.history.search({
        text: '',  // Empty string returns all items
        startTime,
        maxResults: MAX_HISTORY_ITEMS
      })

      if (!historyItems || historyItems.length === 0) {
        return toolSuccess(`No browsing history found in the last ${input.days_back} days.`)
      }

      // Filter out chrome:// and extension pages, deduplicate by URL
      const seen = new Set<string>()
      const cleanItems = historyItems
        .filter(item => {
          if (!item.url || !item.title) return false
          if (item.url.startsWith('chrome://') || item.url.startsWith('chrome-extension://')) return false
          if (seen.has(item.url)) return false
          seen.add(item.url)
          return true
        })
        .slice(0, MAX_HISTORY_ITEMS)

      if (cleanItems.length === 0) {
        return toolSuccess('No relevant browsing history found.')
      }

      this.executionContext.getPubSub().publishMessage(
        PubSub.createMessage(`Analyzing ${cleanItems.length} history entries with AI…`, 'thinking')
      )

      // Build a compact list for the LLM
      const historyText = cleanItems
        .map((item, i) => {
          const visitDate = item.lastVisitTime
            ? new Date(item.lastVisitTime).toLocaleDateString()
            : 'unknown date'
          return `${i + 1}. "${item.title}" - ${item.url} (${visitDate})`
        })
        .join('\n')

      const systemPrompt = `You are a browser history search assistant. Given a user's browsing history and a natural language query, identify the most relevant entries.

Return a JSON object with:
- "matches": array of up to ${input.max_results} most relevant items with fields:
  - "url": exact URL
  - "title": page title
  - "relevance_reason": brief explanation of why this matches the query
  - "visit_date": the visit date string
- "search_summary": 1-2 sentence summary of what was found

Only include genuinely relevant matches. If nothing is relevant, return an empty matches array.`

      const userPrompt = `Search query: "${input.query}"\n\nBrowsing history:\n${historyText}`

      const llm = await this.executionContext.getLLM({ temperature: 0.1 })
      const structuredLLM = llm.withStructuredOutput(HistorySearchResultSchema)

      const result = await invokeWithRetry<HistorySearchResult>(
        structuredLLM,
        [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
        3
      )

      if (result.matches.length === 0) {
        return toolSuccess(`No matching history found for: "${input.query}"\n\n${result.search_summary}`)
      }

      const lines: string[] = [
        `**History Search: "${input.query}"** (${result.matches.length} match${result.matches.length !== 1 ? 'es' : ''})`,
        '',
        result.search_summary,
        ''
      ]

      for (let i = 0; i < result.matches.length; i++) {
        const m = result.matches[i]
        lines.push(`${i + 1}. **[${m.title}](${m.url})**`)
        lines.push(`   📅 ${m.visit_date} — ${m.relevance_reason}`)
        lines.push('')
      }

      return toolSuccess(lines.join('\n'))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return toolError(`History search failed: ${msg}`)
    }
  }
}

export function createHistorySearchTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const tool = new HistorySearchTool(executionContext)

  return new DynamicStructuredTool({
    name: 'history_search_tool',
    description: `Search browser history using natural language queries.
Fetches recent browsing history and uses AI to find relevant matches.
Use when the user says things like:
- "find that article about X I read"
- "show me sites I visited about Y"
- "what did I read last week about Z"
Supports filtering by number of days back (default 30) and max results (default 10).`,
    schema: HistorySearchInputSchema,
    func: async (args: HistorySearchInput): Promise<string> => {
      const result = await tool.execute(args)
      return JSON.stringify(result)
    }
  })
}
