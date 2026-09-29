#!/usr/bin/env npx tsx
/**
 * Reads active projects + tasks from monitor.db and writes
 * data/current-work.json to the portfolio repo, then commits + pushes.
 * Vercel auto-deploys on push.
 *
 * Usage: npx tsx scripts/sync-portfolio.ts
 * Or add to cron / run after task updates.
 */

import Database from "better-sqlite3";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

const PORTFOLIO_DIR = join(__dirname, "../../profolio");
const DB_PATH = join(__dirname, "../monitor.db");
const OUT_PATH = join(PORTFOLIO_DIR, "data/current-work.json");

const STAGE_ORDER = ["shipping", "building", "debugging", "exploring", "shipped"];

interface ProjectRow {
  id: number;
  name: string;
  description: string;
  status: string;
}

interface AgentRow {
  stage: string;
}

interface TaskRow {
  title: string;
  status: string;
}

function main() {
  const db = new Database(DB_PATH, { readonly: true });

  const projects = db
    .prepare<[], ProjectRow>(
      `SELECT id, name, description, status FROM projects WHERE status = 'active' ORDER BY updated_at DESC`
    )
    .all();

  const output = {
    updatedAt: new Date().toISOString(),
    projects: projects.map((p) => {
      const agents = db
        .prepare<[number], AgentRow>(
          `SELECT stage FROM agents WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1`
        )
        .all(p.id);

      const tasks = db
        .prepare<[number], TaskRow>(
          `SELECT title, status FROM tasks WHERE project_id = ? AND status IN ('in-progress','todo') ORDER BY priority DESC, updated_at DESC LIMIT 5`
        )
        .all(p.id);

      const stage = agents[0]?.stage || "exploring";

      return {
        name: p.name,
        description: p.description || "",
        stage,
        tasks: tasks.map((t) => t.title),
        href: null as string | null,
      };
    }),
  };

  // Sort by stage priority
  output.projects.sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  );

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.projects.length} projects to ${OUT_PATH}`);

  // Git commit + push in portfolio repo
  try {
    execSync(`git -C "${PORTFOLIO_DIR}" add data/current-work.json`, { stdio: "inherit" });
    const diff = execSync(`git -C "${PORTFOLIO_DIR}" diff --cached --stat`).toString().trim();
    if (!diff) {
      console.log("No changes to portfolio. Skipping commit.");
      return;
    }
    execSync(
      `git -C "${PORTFOLIO_DIR}" commit -m "chore: sync current work from monitor"`,
      { stdio: "inherit" }
    );
    execSync(`git -C "${PORTFOLIO_DIR}" push`, { stdio: "inherit" });
    console.log("Portfolio updated and pushed. Vercel will redeploy.");
  } catch (e) {
    console.error("Git step failed (is portfolio a remote-tracked repo?):", e);
  }

  db.close();
}

main();
