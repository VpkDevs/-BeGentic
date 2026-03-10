import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolSuccess, toolError, type ToolOutput } from '@/lib/tools/tool.interface'
import { PubSub } from '@/lib/pubsub'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { invokeWithRetry } from '@/lib/utils/retryable'

// Input schema for tab summarization
const SummarizeTabsInputSchema = z.object({
  tab_ids: z.array(z.number()).optional()
    .describe('Optional list of tab IDs to summarize. If omitted, summarizes all tabs in the current window.'),
  detail_level: z.enum(['brief', 'detailed']).default('brief')
    .describe('Level of detail: brief (1-2 sentences) or detailed (full paragraph).')
})

type SummarizeTabsInput = z.infer<typeof SummarizeTabsInputSchema>

const SummarySchema = z.object({
  tabId: z.number(),
  title: z.string(),
  url: z.string(),
  summary: z.string()
})

const SummariesSchema = z.object({
  summaries: z.array(SummarySchema),
  overview: z.string()
})

type Summaries = z.infer<typeof SummariesSchema>

/**
 * SummarizeTabsTool - Produces an AI-generated summary of all (or selected) open tabs.
 * Useful for quickly understanding what is currently open and how tabs relate to each other.
 */
export class SummarizeTabsTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: SummarizeTabsInput): Promise<ToolOutput> {
    try {
      this.executionContext.getPubSub().publishMessage(
        PubSub.createMessage('Gathering tab information for summarization…', 'thinking')
      )

      // Resolve tab list
      let tabs: chrome.tabs.Tab[]
      if (input.tab_ids && input.tab_ids.length > 0) {
        tabs = await Promise.all(input.tab_ids.map(id => chrome.tabs.get(id)))
      } else {
        const win = await this.executionContext.browserContext.getCurrentWindow()
        tabs = await chrome.tabs.query({ windowId: win.id })
      }

      // Filter out system tabs without useful content
      const usableTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))

      if (usableTabs.length === 0) {
        return toolError('No summarizable tabs found (all tabs are browser-internal pages).')
      }

      // Build a compact description of each tab for the LLM
      const tabDescriptions = usableTabs
        .map((t, i) => `Tab ${i + 1} (id=${t.id}): "${t.title ?? 'Untitled'}" – ${t.url}`)
        .join('\n')

      const systemPrompt = `You are a browser assistant that summarizes open browser tabs.
Given a list of tabs (title + URL), produce a JSON response with:
- "summaries": array of { tabId, title, url, summary } objects where summary is ${input.detail_level === 'brief' ? '1-2 sentences' : 'a full paragraph'} describing what the page is about.
- "overview": a 1-2 sentence meta-summary of the overall research/work theme across all tabs.`

      const userPrompt = `Here are the open tabs:\n\n${tabDescriptions}\n\nSummarize each tab and provide an overview.`

      const llm = await this.executionContext.getLLM({ temperature: 0.2 })
      const structuredLLM = llm.withStructuredOutput(SummariesSchema)

      this.executionContext.getPubSub().publishMessage(
        PubSub.createMessage(`Summarizing ${usableTabs.length} tab(s)…`, 'thinking')
      )

      const result = await invokeWithRetry<Summaries>(
        structuredLLM,
        [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
        3
      )

      // Format for display
      const lines: string[] = []
      lines.push(`**Overview:** ${result.overview}`, '')
      for (const s of result.summaries) {
        lines.push(`**[${s.title}](${s.url})**`)
        lines.push(s.summary)
        lines.push('')
      }

      return toolSuccess(lines.join('\n'))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return toolError(`Tab summarization failed: ${msg}`)
    }
  }
}

export function createSummarizeTabsTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const tool = new SummarizeTabsTool(executionContext)

  return new DynamicStructuredTool({
    name: 'summarize_tabs_tool',
    description: `Produce an AI-generated summary of all open browser tabs (or a selected subset).
Returns a per-tab summary plus an overall theme overview.
Use this when the user asks "what do I have open?", "summarize my tabs", or wants an overview of their current browsing session.`,
    schema: SummarizeTabsInputSchema,
    func: async (args: SummarizeTabsInput): Promise<string> => {
      const result = await tool.execute(args)
      return JSON.stringify(result)
    }
  })
}
