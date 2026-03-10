import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolSuccess, toolError, type ToolOutput } from '@/lib/tools/tool.interface'
import { PubSub } from '@/lib/pubsub'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { invokeWithRetry } from '@/lib/utils/retryable'

// Max characters of page content to translate (avoids token overload)
const MAX_TRANSLATION_CHARS = 8000

// Input schema
const TranslateInputSchema = z.object({
  tab_id: z.number().optional()
    .describe('Tab ID whose page content should be translated. Required when translating a full page.'),
  text: z.string().optional()
    .describe('Specific text snippet to translate. Use this instead of tab_id for translating selected text.'),
  target_language: z.string()
    .describe('Target language name or ISO-639 code (e.g. "Spanish", "French", "zh", "ja", "ar").'),
  source_language: z.string().optional()
    .describe('Source language (optional, auto-detected when omitted).')
})

type TranslateInput = z.infer<typeof TranslateInputSchema>

const TranslationResultSchema = z.object({
  translated: z.string(),
  source_language_detected: z.string(),
  notes: z.string().optional()
})

type TranslationResult = z.infer<typeof TranslationResultSchema>

/**
 * TranslateTool - Translate page content or a text snippet to any language using the LLM.
 */
export class TranslateTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: TranslateInput): Promise<ToolOutput> {
    if (!input.tab_id && !input.text) {
      return toolError('Either tab_id or text must be provided.')
    }

    try {
      let sourceText: string
      let contextLabel: string

      if (input.text) {
        sourceText = input.text
        contextLabel = 'provided text'
      } else {
        // Extract text content from the page
        this.executionContext.getPubSub().publishMessage(
          PubSub.createMessage(`Reading page content for translation…`, 'thinking')
        )
        const pages = await this.executionContext.browserContext.getPages([input.tab_id!])
        if (!pages || pages.length === 0) {
          return toolError(`Tab ${input.tab_id} not found`)
        }
        const page = pages[0]
        const snapshot = await page.getTextSnapshot()
        sourceText = snapshot.sections && snapshot.sections.length > 0
          ? snapshot.sections.map((s: any) => s.content || s.text || '').join('\n')
          : ''

        if (!sourceText.trim()) {
          return toolError('Could not extract text from the page.')
        }

        // Limit to avoid token limits
        if (sourceText.length > MAX_TRANSLATION_CHARS) {
          sourceText = sourceText.slice(0, MAX_TRANSLATION_CHARS) + '\n\n[Content truncated for translation]'
        }

        const title = await page.title()
        contextLabel = `page "${title}"`
      }

      this.executionContext.getPubSub().publishMessage(
        PubSub.createMessage(`Translating ${contextLabel} to ${input.target_language}…`, 'thinking')
      )

      const sourceLangHint = input.source_language
        ? `Source language: ${input.source_language}.`
        : 'Auto-detect the source language.'

      const systemPrompt = `You are a professional translator. Translate the given text accurately and naturally.
${sourceLangHint}
Target language: ${input.target_language}.
Return a JSON object with:
- "translated": the translated text
- "source_language_detected": the detected (or provided) source language name
- "notes": optional translator notes about ambiguous terms or cultural adaptations (leave empty string if none)`

      const userPrompt = `Translate the following text:\n\n${sourceText}`

      const llm = await this.executionContext.getLLM({ temperature: 0.1 })
      const structuredLLM = llm.withStructuredOutput(TranslationResultSchema)

      const result = await invokeWithRetry<TranslationResult>(
        structuredLLM,
        [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
        3
      )

      const lines = [
        `**Translation to ${input.target_language}** (from ${result.source_language_detected})`,
        '',
        result.translated
      ]
      if (result.notes) {
        lines.push('', `*Translator notes: ${result.notes}*`)
      }

      return toolSuccess(lines.join('\n'))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return toolError(`Translation failed: ${msg}`)
    }
  }
}

export function createTranslateTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const tool = new TranslateTool(executionContext)

  return new DynamicStructuredTool({
    name: 'translate_tool',
    description: `Translate web page content or a text snippet to any language using AI.
Supports all major languages. Either provide a tab_id to translate the full page, or provide a text snippet directly.
Examples: translate current page to French, translate selected text to Japanese, translate article to Spanish.`,
    schema: TranslateInputSchema,
    func: async (args: TranslateInput): Promise<string> => {
      const result = await tool.execute(args)
      return JSON.stringify(result)
    }
  })
}
