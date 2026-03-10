import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolSuccess, toolError, type ToolOutput } from '@/lib/tools/tool.interface'
import { PubSub } from '@/lib/pubsub'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { invokeWithRetry } from '@/lib/utils/retryable'

// Input schema
const FactCheckInputSchema = z.object({
  tab_id: z.number().optional()
    .describe('Tab ID of the page to fact-check. When omitted, uses the currently active tab.'),
  claim: z.string().optional()
    .describe('A specific claim or statement to fact-check. When omitted, the tool extracts and checks key claims from the page.'),
  max_claims: z.number().int().min(1).max(10).default(5)
    .describe('Maximum number of claims to evaluate when checking the full page (1-10, default 5).')
})

type FactCheckInput = z.infer<typeof FactCheckInputSchema>

const ClaimResultSchema = z.object({
  claim: z.string(),
  verdict: z.enum(['likely_true', 'likely_false', 'unverifiable', 'needs_context', 'opinion']),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1)
})

const FactCheckResultSchema = z.object({
  claims: z.array(ClaimResultSchema),
  overall_assessment: z.string()
})

type FactCheckResult = z.infer<typeof FactCheckResultSchema>

const VERDICT_EMOJI: Record<string, string> = {
  likely_true: '✅',
  likely_false: '❌',
  unverifiable: '❓',
  needs_context: '⚠️',
  opinion: '💭'
}

/**
 * FactCheckTool - AI-powered fact-checker for web page content.
 * Identifies claims and assesses their likely accuracy using the LLM's knowledge.
 */
export class FactCheckTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: FactCheckInput): Promise<ToolOutput> {
    try {
      this.executionContext.getPubSub().publishMessage(
        PubSub.createMessage('Extracting content for fact-checking…', 'thinking')
      )

      let pageContent: string
      let pageTitle: string

      if (input.claim) {
        // Single claim to check – no page extraction needed
        pageContent = input.claim
        pageTitle = 'provided claim'
      } else {
        // Extract the page content
        let tabId = input.tab_id
        if (!tabId) {
          const tab = await chrome.tabs.query({ active: true, currentWindow: true })
          if (!tab[0]?.id) return toolError('Could not determine the active tab.')
          tabId = tab[0].id
        }

        const pages = await this.executionContext.browserContext.getPages([tabId])
        if (!pages || pages.length === 0) return toolError(`Tab ${tabId} not found`)

        const page = pages[0]
        const snapshot = await page.getTextSnapshot()
        pageContent = snapshot.sections && snapshot.sections.length > 0
          ? snapshot.sections.map((s: any) => s.content || s.text || '').join('\n')
          : ''

        if (!pageContent.trim()) return toolError('Could not extract text from the page.')

        // Trim to avoid token overload
        if (pageContent.length > 6000) {
          pageContent = pageContent.slice(0, 6000) + '\n[Content truncated]'
        }

        pageTitle = await page.title()
      }

      this.executionContext.getPubSub().publishMessage(
        PubSub.createMessage('Running AI fact-check analysis…', 'thinking')
      )

      const systemPrompt = `You are an expert fact-checker and critical thinking analyst.
Your job is to identify key factual claims in text and assess each one based on your training knowledge.

For each claim, provide:
- "claim": the exact or paraphrased claim
- "verdict": one of: likely_true, likely_false, unverifiable, needs_context, opinion
- "reasoning": 1-2 sentence explanation
- "confidence": number 0-1 indicating your confidence in the verdict

Also provide an "overall_assessment" summarizing the credibility of the content.

Verdicts:
- likely_true: well-established fact you can verify
- likely_false: contradicts established knowledge
- unverifiable: cannot be verified with available knowledge
- needs_context: true only under certain conditions
- opinion: subjective statement, not a factual claim

${input.claim ? 'Evaluate only the provided claim.' : `Extract and evaluate up to ${input.max_claims} key factual claims from the content.`}`

      const userPrompt = input.claim
        ? `Fact-check this claim: "${input.claim}"`
        : `Fact-check key claims in this content from "${pageTitle}":\n\n${pageContent}`

      const llm = await this.executionContext.getLLM({ temperature: 0.1 })
      const structuredLLM = llm.withStructuredOutput(FactCheckResultSchema)

      const result = await invokeWithRetry<FactCheckResult>(
        structuredLLM,
        [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
        3
      )

      // Format output
      const lines: string[] = ['**🔍 Fact-Check Results**', '']
      for (const c of result.claims) {
        const emoji = VERDICT_EMOJI[c.verdict] ?? '❓'
        const pct = Math.round(c.confidence * 100)
        lines.push(`${emoji} **${c.claim}**`)
        lines.push(`  Verdict: ${c.verdict.replace(/_/g, ' ')} (${pct}% confidence)`)
        lines.push(`  ${c.reasoning}`)
        lines.push('')
      }
      lines.push(`**Overall Assessment:** ${result.overall_assessment}`)

      return toolSuccess(lines.join('\n'))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return toolError(`Fact-check failed: ${msg}`)
    }
  }
}

export function createFactCheckTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const tool = new FactCheckTool(executionContext)

  return new DynamicStructuredTool({
    name: 'fact_check_tool',
    description: `AI-powered fact-checker that identifies and evaluates factual claims on a web page.
Can check a specific claim or scan the full page for key claims.
Returns a verdict (likely_true/likely_false/unverifiable/needs_context/opinion) with reasoning for each claim.
Use when the user asks to fact-check a page, verify a claim, or assess content credibility.`,
    schema: FactCheckInputSchema,
    func: async (args: FactCheckInput): Promise<string> => {
      const result = await tool.execute(args)
      return JSON.stringify(result)
    }
  })
}
