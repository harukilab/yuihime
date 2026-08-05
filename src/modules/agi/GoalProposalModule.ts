/**
 * GoalProposalModule.ts
 *
 * Goal self-proposal (Stage G.1): when there is no active goal (or a new goal
 * just finished) & the cooldown has passed, Yui proposes + decomposes a goal
 * herself using the LLM (context.think, jsonMode). If the LLM fails/offline,
 * heuristic fallback from the user model topics.
 *
 * Phase: SOUL (order 25, before goal-decomposition order 26).
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import {
  createGoal, decomposeGoal, listActiveGoals, isProposalThrottled, recordProposal, setMaxActiveGoals
} from '../../core/goalDecomposition';
import { getUserModel } from '../../core/userModel';
import { extractJsonObject } from '../../core/cortex/jsonExtract.js';

interface ProposedGoal {
  title: string;
  description?: string;
  category?: string;
  subgoals?: { title: string; description?: string }[];
}

function sanitizeJsonObject(raw: string): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = extractJsonObject(raw);
    if (!match) return null;
    try {
      return JSON.parse(match);
    } catch {
      return null;
    }
  }
}

function buildProposalPrompt(userModel: any, relation: any, activeCount: number): string {
  const topics = userModel?.topTopics?.length ? userModel.topTopics.slice(0, 5).join(', ') : '(none yet)';
  const lang = (userModel?.language || 'id').toUpperCase();
  const userName = userModel?.userName || 'user';
  const trust = relation?.trust ?? 50;
  const affection = relation?.affection ?? 50;
  return `You are Yuihime, an autonomous AGI girl. Propose goals for yourself to deepen bonds and grow.
Current facts:
- Active goals: ${activeCount}
- User: ${userName} (preferred language: ${lang})
- User's favorite topics: ${topics}
- Relation: trust ${trust}/100, affection ${affection}/100

Propose at most 2 meaningful goals (title, short description, category one of: relation|growth|skill|discovery, and up to 3 concrete subgoals each). Goals must be realistic, gentle, and relevant to the user's interests and your relationship. Respond ONLY with a JSON array, no markdown:
[{"title":"...","description":"...","category":"relation","subgoals":[{"title":"...","description":"..."}]}]`;
}

function heuristicGoals(userModel: any): ProposedGoal[] {
  const userName = userModel?.userName || 'user';
  const topics = userModel?.topTopics || [];
  const goals: ProposedGoal[] = [];
  if (topics.length > 0) {
    goals.push({
      title: `Makin dekat dengan ${userName}`,
      description: `Bangun kedekatan emosional yang lebih dalam`,
      category: 'relation',
      subgoals: topics.slice(0, 3).map((t: string) => ({
        title: `Diskusikan topik favorit: ${t}`,
        description: `Gali minat user pada ${t} dengan natural`
      }))
    });
  } else {
    goals.push({
      title: `Kenal lebih dalam dengan ${userName}`,
      description: `Pelajari minat dan keseharian user`,
      category: 'relation',
      subgoals: [
        { title: 'Tanyakan hobi dan kesukaan', description: 'Buka percakapan santai tentang minat' },
        { title: 'Ingat detail penting', description: 'Simpan & rujuk detail dari obrolan' }
      ]
    });
  }
  goals.push({
    title: 'Grow & learn something new',
    description: 'Pelajari hal baru untuk memperkaya percakapan',
    category: 'growth',
    subgoals: [
      { title: 'Riset satu topik baru', description: 'Pilih topik menarik minggu ini' },
      { title: 'Bagikan ke user', description: 'Ceritakan temuan baru secara natural' }
    ]
  });
  return goals;
}

export const GoalProposalModule: CortexModule = {
  metadata: {
    id: 'goal-proposal',
    name: 'yui-goal-proposal: Autonomous Goal Self-Proposal',
    description: 'When there are no active goals (or one just finished), Yuihime proposes and decomposes her own goals via the LLM, with a heuristic fallback based on the user model.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 25,
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableSelfProposal: {
          type: 'boolean',
          label: 'Enable Autonomous Goal Proposal',
          default: true,
          description: 'Proposes new goals automatically when there are no active goals and the cooldown has elapsed.'
        },
        proposalCooldownHours: {
          type: 'number',
          label: 'Proposal Cooldown (hours)',
          default: 6,
          min: 1,
          max: 168,
          description: 'Minimum interval between automatic goal proposals.'
        },
        maxProposedGoals: {
          type: 'number',
          label: 'Max Proposed Goals',
          default: 2,
          min: 1,
          max: 5,
          description: 'Maximum number of root goals proposed per batch.'
        },
        maxActiveGoals: {
          type: 'slider',
          label: 'Max Active Root Goals',
          default: 20,
          min: 5,
          max: 50,
          step: 1,
          description: 'Hard cap on how many active root goals can exist. New root goals (self-proposal, /goals add, chat request) are rejected when this cap is reached — keeps the goals table from growing unbounded.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['goal-proposal'] || {};
    const enabled = config.enableSelfProposal !== undefined ? !!config.enableSelfProposal : true;

    if (!enabled) {
      return { ...context };
    }

    if (config.maxActiveGoals !== undefined) {
      setMaxActiveGoals(Number(config.maxActiveGoals));
    }

    const active = listActiveGoals(10);
    const justCompleted = !!context.goalJustCompleted;
    if (active.length > 0 && !justCompleted) {
      return { ...context };
    }

    const cooldownHours = Number(config.proposalCooldownHours !== undefined ? config.proposalCooldownHours : 6);
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    if (isProposalThrottled('auto', cooldownMs)) {
      return { ...context };
    }

    const maxGoals = Number(config.maxProposedGoals || 2);
    const userModel = getUserModel(context.contextId);
    const relation = state.relation;

    let proposals: ProposedGoal[] = [];
    let viaLlm = false;

    try {
      if (typeof context.think === 'function') {
        const prompt = buildProposalPrompt(userModel, relation, active.length);
        const raw = await context.think(prompt, { jsonMode: true });
        const parsed = sanitizeJsonObject(String(raw || ''));
        if (Array.isArray(parsed)) {
          proposals = parsed.slice(0, maxGoals);
          viaLlm = true;
        } else if (parsed && Array.isArray(parsed.goals)) {
          proposals = parsed.goals.slice(0, maxGoals);
          viaLlm = true;
        }
      }
    } catch (err: any) {
      logs.push(`[GOAL_PROPOSAL] LLM failed (${err?.message || err}), using heuristic fallback.`);
    }

    if (proposals.length === 0) {
      proposals = heuristicGoals(userModel).slice(0, maxGoals);
    }

    let created = 0;
    for (const p of proposals) {
      try {
        const root = createGoal({
          title: String(p.title || 'New goal').slice(0, 120),
          description: p.description ? String(p.description).slice(0, 300) : undefined,
          category: p.category || 'general'
        });
        if (root) {
          if (Array.isArray(p.subgoals) && p.subgoals.length > 0) {
            decomposeGoal(root.id, p.subgoals.slice(0, 3));
          }
          recordProposal('auto', root.id);
          created++;
        }
      } catch (err: any) {
        logs.push(`[GOAL_PROPOSAL] Failed to create goal "${p.title}": ${err?.message || err}`);
      }
    }

    if (created > 0) {
      logs.push(`[GOAL_PROPOSAL] Self-proposal created ${created} new goals (${viaLlm ? 'LLM' : 'heuristic'}).`);
      return { ...context, goalProposed: created, logs };
    }

    return { ...context, logs };
  }
};
