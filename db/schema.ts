import { relations, sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').default(''),
  color: text('color').default('#6366f1'),
  status: text('status', { enum: ['active', 'archived'] }).default('active').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
})

export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['claude', 'codex', 'cursor', 'gemini', 'other'] }).default('claude').notNull(),
  status: text('status', { enum: ['running', 'idle', 'done', 'blocked'] }).default('idle').notNull(),
  notes: text('notes').default(''),
  plan: text('plan').default(''),      // markdown: goals, stage, risks
  stage: text('stage').default(''),    // e.g. "exploring", "building", "debugging", "shipping"
  risks: text('risks').default(''),    // markdown list of anticipated problems
  pid: integer('pid'),
  autoDetected: integer('auto_detected', { mode: 'boolean' }).default(false).notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
})

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').default(''),
  status: text('status', { enum: ['todo', 'in-progress', 'done', 'blocked'] }).default('todo').notNull(),
  priority: text('priority', { enum: ['low', 'med', 'high'] }).default('med').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
})

export const goals = sqliteTable('goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').default(''),
  status: text('status', { enum: ['todo', 'in-progress', 'done'] }).default('todo').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
})

export const projectsRelations = relations(projects, ({ many }) => ({
  agents: many(agents),
  goals: many(goals),
  tasks: many(tasks),
}))

export const agentsRelations = relations(agents, ({ one, many }) => ({
  project: one(projects, { fields: [agents.projectId], references: [projects.id] }),
  tasks: many(tasks),
}))

export const tasksRelations = relations(tasks, ({ one }) => ({
  agent: one(agents, { fields: [tasks.agentId], references: [agents.id] }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
}))

export const goalsRelations = relations(goals, ({ one }) => ({
  project: one(projects, { fields: [goals.projectId], references: [projects.id] }),
}))

export type Project = typeof projects.$inferSelect
export type Agent = typeof agents.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Goal = typeof goals.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type NewAgent = typeof agents.$inferInsert
export type NewTask = typeof tasks.$inferInsert
export type NewGoal = typeof goals.$inferInsert

export const memorySync = sqliteTable('memory_sync', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull().unique(), // JSONL file path or "agent:{id}"
  lastLineCount: integer('last_line_count').default(0).notNull(),
  lastIngestedAt: text('last_ingested_at'),
})

export type MemorySync = typeof memorySync.$inferSelect
