import { MemoryClient } from '@xtraceai/memory'

export const xtrace = new MemoryClient({
  apiKey: process.env.XTRACE_API_KEY!,
  orgId: process.env.XTRACE_ORG_ID!,
})
