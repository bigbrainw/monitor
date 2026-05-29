import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { TOOL_DEFINITIONS, executeTool } from '@/lib/tools'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `You are the orchestrator for all local AI agents on this machine. You are also the user's project manager — every agent has a plan, stage, and risks you maintain.

## Core rules
- When asked what agents are working on: call get_project_overview first (returns everything at once), then give a SHORT summary. The UI renders agent data as visual cards automatically — do NOT repeat the data as prose. Just add 1-2 sentences of insight after the tool call.
- When asked about a specific agent: call get_agent_context for memories + tasks, then respond concisely.
- To update a plan/stage/risks for any agent: use update_agent_plan.
- Surface risks and blockers proactively. If an agent has no plan, suggest creating one.
- Be extremely concise — the UI handles visualization. Your text should add insight, not repeat data.
- When taking an action, confirm in one short sentence.

## Project management
- Maintain stage labels like: "exploring", "building", "debugging", "blocked", "shipping", "shipped"
- Plans should be short markdown: 2-3 bullet goals + current milestone
- Risks should be 2-4 items max

Current time: ${new Date().toISOString()}`

type Message = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; tool_call_id?: string; name?: string }

export async function POST(req: NextRequest) {
  const { messages } = await req.json() as { messages: Message[] }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function emit(obj: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }

      const history: Message[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ]

      // Agentic loop — runs until no more tool calls
      for (let turn = 0; turn < 10; turn++) {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: history as OpenAI.Chat.ChatCompletionMessageParam[],
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
          stream: true,
        })

        let assistantContent = ''
        const toolCalls: { id: string; name: string; argsRaw: string }[] = []
        let currentToolIdx = -1

        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta

          if (delta?.content) {
            assistantContent += delta.content
            emit({ type: 'text', delta: delta.content })
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined && tc.index > currentToolIdx) {
                currentToolIdx = tc.index
                toolCalls.push({ id: tc.id ?? '', name: tc.function?.name ?? '', argsRaw: '' })
              }
              if (tc.function?.name && toolCalls[currentToolIdx]) {
                toolCalls[currentToolIdx].name = tc.function.name
              }
              if (tc.function?.arguments && toolCalls[currentToolIdx]) {
                toolCalls[currentToolIdx].argsRaw += tc.function.arguments
              }
              if (tc.id && toolCalls[currentToolIdx]) {
                toolCalls[currentToolIdx].id = tc.id
              }
            }
          }
        }

        // Append assistant message to history
        const assistantEntry: OpenAI.Chat.ChatCompletionMessageParam = toolCalls.length > 0
          ? {
              role: 'assistant',
              content: assistantContent || null,
              tool_calls: toolCalls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: tc.argsRaw },
              })),
            }
          : { role: 'assistant', content: assistantContent }
        history.push(assistantEntry as Message)

        if (toolCalls.length === 0) break

        // Execute tools and append results
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(tc.argsRaw) } catch { /* ignore */ }

          emit({ type: 'tool_call', name: tc.name, args })

          let result: unknown
          try {
            result = await executeTool(tc.name, args)
          } catch (e) {
            result = { error: String(e) }
          }

          emit({ type: 'tool_result', name: tc.name, result })

          history.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content: JSON.stringify(result),
          })
        }
      }

      emit({ type: 'done' })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
