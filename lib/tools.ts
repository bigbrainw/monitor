import { db } from '@/db'
import { agents, tasks, projects, goals } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { xtrace } from './xtrace'

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_agents',
      description: 'List all AI agents with their current status, type, project, and recent tasks.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_agent_context',
      description: 'Get full context for a specific agent: their memories from XTrace, all tasks, and notes.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'number', description: 'The agent DB id' },
          query: { type: 'string', description: 'Optional natural language query to focus the memory search' },
        },
        required: ['agent_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_all_memory',
      description: 'Search XTrace memories across ALL agents for a given query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_running_processes',
      description: 'Get currently running AI agent processes detected on this machine.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description: 'Create a new task for an agent.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'number', description: 'The agent DB id' },
          title: { type: 'string', description: 'Task title' },
          priority: { type: 'string', enum: ['low', 'med', 'high'], description: 'Task priority (default med)' },
        },
        required: ['agent_id', 'title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_task',
      description: 'Update a task status or title.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'number', description: 'The task DB id' },
          status: { type: 'string', enum: ['todo', 'in-progress', 'done', 'blocked'] },
          title: { type: 'string', description: 'New title (optional)' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_project',
      description: 'Create a new project to group agents and goals.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Project name' },
          description: { type: 'string', description: 'Project description' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'assign_agent_to_project',
      description: 'Assign an agent to a project.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'number' },
          project_id: { type: 'number' },
        },
        required: ['agent_id', 'project_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_agent_status',
      description: 'Update an agent status.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'number' },
          status: { type: 'string', enum: ['idle', 'running', 'done', 'blocked'] },
        },
        required: ['agent_id', 'status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_projects',
      description: 'List all projects with their agents and goals.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_agent_plan',
      description: 'Set or update an agent\'s plan (goals, current stage, and anticipated risks). Use markdown. This is the single source of truth for project management.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'number' },
          stage: { type: 'string', description: 'Short current stage label, e.g. "exploring", "building v2", "debugging auth", "shipping"' },
          plan: { type: 'string', description: 'Markdown plan: what needs to happen, milestones, decisions made' },
          risks: { type: 'string', description: 'Markdown list of anticipated problems or blockers' },
        },
        required: ['agent_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_project_overview',
      description: 'Get a structured overview of ALL agents with their stage, plan, risks, tasks, and memories. Use this when the user wants to understand the full project landscape. Returns data optimized for visual rendering.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_similar_agents',
      description: 'Search XTrace memories across ALL agents for a topic, then group results by agent. Use when the user asks if other agents have worked on something similar, or to find shared knowledge before starting a task.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for across all agents' },
          limit: { type: 'number', description: 'Max memories per agent (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cross_agent_context',
      description: 'Pull relevant memories from agent A and surface them as context for agent B. Use when two agents are working on similar problems and should share knowledge.',
      parameters: {
        type: 'object',
        properties: {
          source_agent_id: { type: 'number', description: 'Agent whose memories to pull from' },
          target_agent_id: { type: 'number', description: 'Agent who needs the context' },
          query: { type: 'string', description: 'What specifically to share' },
        },
        required: ['source_agent_id', 'target_agent_id', 'query'],
      },
    },
  },
]

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_agents': {
      const rows = await db.query.agents.findMany({
        orderBy: (a, { desc }) => [desc(a.updatedAt)],
        with: { tasks: true, project: true },
      })
      return rows.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.status,
        pid: a.pid,
        autoDetected: a.autoDetected,
        project: a.project ? { id: a.project.id, name: a.project.name } : null,
        notes: a.notes,
        tasks: a.tasks.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
        updatedAt: a.updatedAt,
      }))
    }

    case 'get_agent_context': {
      const agentId = args.agent_id as number
      const query = (args.query as string | undefined) ?? ''

      const agent = await db.query.agents.findFirst({
        where: eq(agents.id, agentId),
        with: { tasks: true, project: true },
      })
      if (!agent) return { error: `Agent ${agentId} not found` }

      let memories: unknown[] = []
      if (process.env.XTRACE_API_KEY && !process.env.XTRACE_API_KEY.startsWith('xtk_your')) {
        try {
          if (query.trim()) {
            const res = await xtrace.memories.search({
              query,
              filters: { user_id: String(agentId) },
              limit: 15,
            })
            memories = res.data ?? []
          } else {
            const iter = xtrace.memories.list({ user_id: String(agentId), limit: 15 })
            for await (const m of iter) {
              memories.push(m)
              if (memories.length >= 15) break
            }
          }
        } catch { /* xtrace unavailable */ }
      }

      return {
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          notes: agent.notes,
          project: agent.project,
        },
        tasks: agent.tasks,
        memories,
      }
    }

    case 'search_all_memory': {
      const query = args.query as string
      const limit = (args.limit as number | undefined) ?? 10

      if (!process.env.XTRACE_API_KEY || process.env.XTRACE_API_KEY.startsWith('xtk_your')) {
        return { error: 'XTrace not configured' }
      }

      try {
        const res = await xtrace.memories.search({ query, limit })
        return res.data ?? []
      } catch (e) {
        return { error: String(e) }
      }
    }

    case 'get_running_processes': {
      // Re-use scan logic by fetching from DB agents with status=running
      const running = await db.query.agents.findMany({
        where: eq(agents.status, 'running'),
        with: { tasks: true },
      })
      return running.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        pid: a.pid,
        notes: a.notes,
      }))
    }

    case 'create_task': {
      const [row] = await db.insert(tasks).values({
        agentId: args.agent_id as number,
        title: args.title as string,
        priority: (args.priority as 'low' | 'med' | 'high' | undefined) ?? 'med',
        status: 'todo',
      }).returning()
      return row
    }

    case 'update_task': {
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (args.status) patch.status = args.status
      if (args.title) patch.title = args.title
      const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, args.task_id as number)).returning()
      return row
    }

    case 'create_project': {
      const [row] = await db.insert(projects).values({
        name: args.name as string,
        description: (args.description as string | undefined) ?? '',
      }).returning()
      return row
    }

    case 'assign_agent_to_project': {
      const [row] = await db.update(agents)
        .set({ projectId: args.project_id as number, updatedAt: new Date().toISOString() })
        .where(eq(agents.id, args.agent_id as number))
        .returning()
      return row
    }

    case 'update_agent_status': {
      const [row] = await db.update(agents)
        .set({ status: args.status as 'idle' | 'running' | 'done' | 'blocked', updatedAt: new Date().toISOString() })
        .where(eq(agents.id, args.agent_id as number))
        .returning()
      return row
    }

    case 'list_projects': {
      const rows = await db.query.projects.findMany({
        with: { agents: true, goals: true },
      })
      return rows
    }

    case 'update_agent_plan': {
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (args.stage !== undefined) patch.stage = args.stage
      if (args.plan !== undefined) patch.plan = args.plan
      if (args.risks !== undefined) patch.risks = args.risks
      const [row] = await db.update(agents).set(patch).where(eq(agents.id, args.agent_id as number)).returning()
      return { ok: true, agent: row }
    }

    case 'get_project_overview': {
      const rows = await db.query.agents.findMany({
        orderBy: (a, { desc }) => [desc(a.updatedAt)],
        with: { tasks: true, project: true },
      })
      return rows.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.status,
        stage: a.stage,
        plan: a.plan,
        risks: a.risks,
        notes: a.notes,
        project: a.project ? { id: a.project.id, name: a.project.name } : null,
        tasks: {
          total: a.tasks.length,
          open: a.tasks.filter(t => t.status !== 'done').length,
          done: a.tasks.filter(t => t.status === 'done').length,
          blocked: a.tasks.filter(t => t.status === 'blocked').length,
          items: a.tasks.filter(t => t.status !== 'done').slice(0, 5).map(t => ({
            title: t.title, status: t.status, priority: t.priority,
          })),
        },
      }))
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
