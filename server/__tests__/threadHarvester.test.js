import { describe, expect, it } from 'vitest';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;
if (connectionString) {
  process.env.STORYTIME_DATABASE_URL = connectionString;
}

import {
  generateThreadFingerprint,
  extractExplorationThreads,
  previewExplorationCycle,
  executeExplorationCycle,
  formatStoryTaskDescription,
  MAX_EXPLORATION_DEPTH,
} from '../story-harness/threadHarvester.js';

describe('StoryTime Autonomous Thread Harvester', () => {
  it('generates deterministic SHA-256 fingerprints', () => {
    const fp1 = generateThreadFingerprint({
      projectId: 'proj-1',
      threadType: 'open_question',
      sourceEntityId: 'q-1',
      jobType: 'faction_politics_refinement',
      depth: 1,
      brief: 'Flesh out the cartel board.',
    });

    const fp2 = generateThreadFingerprint({
      projectId: 'proj-1',
      threadType: 'open_question',
      sourceEntityId: 'q-1',
      jobType: 'faction_politics_refinement',
      depth: 1,
      brief: '  flesh out the   cartel board.  ', // whitespace/case variance
    });

    expect(fp1).toEqual(fp2);
    expect(typeof fp1).toBe('string');
    expect(fp1.length).toBe(64); // SHA-256 hex
  });

  it('formats task descriptions with a single valid fenced JSON block', () => {
    const meta = {
      storytimeProjectId: 'proj-1',
      jobType: 'faction_politics_refinement',
      depth: 1,
      cycleId: 'cycle-1',
    };
    const desc = formatStoryTaskDescription(meta);

    // Matches exactly one json fence
    const matches = desc.match(/```json[\s\S]*?```/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(1);

    // Parses cleanly
    const jsonStr = matches[0].replace(/```json\n?/, '').replace(/```$/, '');
    expect(JSON.parse(jsonStr)).toEqual(meta);
  });

  it('extracts exploration threads from promoted open questions and relationship gaps', async () => {
    const mockDb = {
      get: async (sql, ...params) => {
        if (sql.includes('FROM stories')) {
          return { id: 'proj-sci-1', title: 'Void Requiem: The Iron Dirge' };
        }
        return null;
      },
      all: async (sql, ...params) => {
        if (sql.includes('FROM characters')) return [{ id: 'char-vane', name: 'Lord Malakor Vane' }];
        if (sql.includes('FROM locations')) return [{ id: 'loc-slipway-9', name: 'Slipway 9' }];
        if (sql.includes('FROM factions')) return [{ id: 'fac-vander-thorne', name: 'Vander-Thorne Cartel' }];
        if (sql.includes('FROM timeline_events')) return [];
        if (sql.includes('FROM canon_relationships')) {
          return [{
            id: 'rel-1',
            source_id: 'char-vane',
            target_id: 'fac-vander-thorne',
            relationship_type: 'hostile',
          }];
        }
        if (sql.includes('FROM generated_drafts')) {
          return [{
            id: 'draft-seed-1',
            status: 'accepted',
            payload: JSON.stringify({
              worldBrief: {
                name: 'Void Requiem',
                openQuestions: [
                  'Who holds the patent rights to the 142.8 GHz ghost signal transmission?',
                  'How did the Vander-Thorne cartel secure their orbital dreadnought fleet?',
                ],
              },
            }),
            gate_result: { exploration: { depth: 0 } },
          }];
        }
        return [];
      },
    };

    const threads = await extractExplorationThreads('proj-sci-1', { database: mockDb });
    expect(threads.length).toBeGreaterThanOrEqual(3);

    // Identifies signal mystery from question
    const signalThread = threads.find((t) => t.jobType === 'mystery_signal_refinement');
    expect(signalThread).toBeDefined();
    expect(signalThread.depth).toBe(1);

    // Identifies cartel politics from question
    const cartelThread = threads.find((t) => t.jobType === 'faction_politics_refinement');
    expect(cartelThread).toBeDefined();

    // Identifies relationship gap (hostile relationship with 0 timeline events)
    const gapThread = threads.find((t) => t.threadType === 'relationship_gap');
    expect(gapThread).toBeDefined();
    expect(gapThread.mustReference).toContain('char-vane');
    expect(gapThread.mustReference).toContain('fac-vander-thorne');
  });

  it('previews exploration cycle enforcing depth ceiling and deduplication', async () => {
    const mockDb = {
      get: async () => ({ id: 'proj-sci-1', title: 'Void Requiem' }),
      all: async (sql) => {
        if (sql.includes('FROM characters')) return [{ id: 'char-vane' }];
        if (sql.includes('FROM locations')) return [];
        if (sql.includes('FROM factions')) return [{ id: 'fac-1', name: 'Syndicate' }];
        if (sql.includes('FROM timeline_events')) return [];
        if (sql.includes('FROM canon_relationships')) return [];
        if (sql.includes('FROM generated_drafts') && sql.includes('prompt_fingerprint')) {
          return [];
        }
        if (sql.includes('FROM generated_drafts')) {
          return [{
            id: 'draft-1',
            status: 'accepted',
            payload: JSON.stringify({
              worldBrief: {
                openQuestions: ['Question 1', 'Question 2', 'Question 3'],
              },
            }),
            gate_result: { exploration: { depth: 0 } },
          }];
        }
        return [];
      },
    };

    const preview = await previewExplorationCycle('proj-sci-1', {
      database: mockDb,
      maxDepth: 2,
      taskBudget: 2,
    });

    expect(preview.eligibleCount).toBeLessThanOrEqual(2);
    expect(preview.taskBudget).toBe(2);
    expect(preview.candidates || preview.eligible).toBeDefined();
    expect(preview.eligible.every((t) => t.depth <= 2)).toBe(true);
  });

  it('executes exploration cycle with migrated local_ready routing and storytime labels', async () => {
    const mockDb = {
      get: async () => ({ id: 'proj-sci-1', title: 'Void Requiem' }),
      all: async (sql) => {
        if (sql.includes('FROM characters')) return [{ id: 'char-vane' }];
        if (sql.includes('FROM locations')) return [];
        if (sql.includes('FROM factions')) return [{ id: 'fac-1', name: 'Syndicate' }];
        if (sql.includes('FROM timeline_events')) return [];
        if (sql.includes('FROM canon_relationships')) return [];
        if (sql.includes('FROM generated_drafts') && sql.includes('prompt_fingerprint')) {
          return [];
        }
        if (sql.includes('FROM generated_drafts')) {
          return [{
            id: 'draft-1',
            status: 'accepted',
            payload: JSON.stringify({
              worldBrief: {
                openQuestions: ['What is the origin of the ghost frequency?'],
              },
            }),
            gate_result: { exploration: { depth: 0 } },
          }];
        }
        return [];
      },
      run: async () => ({ changes: 1 }),
    };

    const createdTasks = [];
    const mockDashboard = {
      listTasks: async () => [],
      createTask: async (pId, task) => {
        createdTasks.push({ id: 950 + createdTasks.length, ...task });
        return { id: 950 + createdTasks.length };
      },
    };

    const result = await executeExplorationCycle('proj-sci-1', {
      dashboard: mockDashboard,
      database: mockDb,
      maxDepth: 2,
      taskBudget: 3,
    });

    expect(result.success).toBe(true);
    expect(createdTasks.length).toBeGreaterThan(0);

    for (const t of createdTasks) {
      // 1. Must use local_ready
      expect(t.delegation_status).toBe('local_ready');
      // 2. Must use storytime-generation and storytime-job:*
      expect(t.labels).toContain('storytime-generation');
      expect(t.labels.some((l) => l.startsWith('storytime-job:'))).toBe(true);
      // 3. Must NOT contain local-code
      expect(t.labels).not.toContain('local-code');
      // 4. Must contain fenced JSON metadata
      expect(t.description).toContain('```json');
    }
  });

  it('quarantined branches in exploration_branches block candidate spawning', async () => {
    const branchKey = 'proj-sci-1:factions:faction_politics_refinement:fac-1';
    const mockDb = {
      get: async (sql) => {
        if (sql.includes('FROM stories')) return { id: 'proj-sci-1', title: 'Void Requiem' };
        return null;
      },
      all: async (sql) => {
        if (sql.includes('FROM exploration_branches')) {
          return [{
            id: 'b-1',
            branch_key: branchKey,
            is_quarantined: true,
            quarantined_at: new Date().toISOString(),
            source_canon_ids: ['fac-1'],
          }];
        }
        if (sql.includes('FROM characters')) return [];
        if (sql.includes('FROM locations')) return [];
        if (sql.includes('FROM factions')) return [{ id: 'fac-1', name: 'Syndicate' }];
        if (sql.includes('FROM timeline_events')) return [];
        if (sql.includes('FROM canon_relationships')) return [];
        if (sql.includes('FROM generated_drafts')) return [];
        if (sql.includes('FROM exploration_threads')) return [];
        return [];
      },
    };

    const preview = await previewExplorationCycle('proj-sci-1', {
      database: mockDb,
      maxDepth: 2,
    });

    expect(preview.eligible.some((t) => t.branchKey === branchKey)).toBe(false);
    expect(preview.skipped.some((s) => s.reason === 'branch_quarantined')).toBe(true);
  });

  it('throttles exploration when active StoryTime generation backlog reaches budget', async () => {
    const mockDb = {
      get: async (sql) => {
        if (sql.includes('FROM stories')) return { id: 'proj-sci-1', title: 'Void Requiem' };
        return null;
      },
      all: async () => [],
      run: async () => ({ changes: 1 }),
    };

    // 8 active StoryTime generation tasks on dashboard
    const activeTasks = Array.from({ length: 8 }, (_, i) => ({
      id: 100 + i,
      status: 'in_progress',
      labels: ['storytime-generation', 'storytime-job:faction_politics_refinement'],
    }));

    const preview = await previewExplorationCycle('proj-sci-1', {
      database: mockDb,
      activeDashboardTasks: activeTasks,
      taskBudget: 8,
    });

    expect(preview.throttled).toBe(true);
    expect(preview.activeBacklog).toBe(8);
    expect(preview.eligibleCount).toBe(0);

    const execResult = await executeExplorationCycle('proj-sci-1', {
      dashboard: { listTasks: async () => activeTasks },
      database: mockDb,
      taskBudget: 8,
    });

    expect(execResult.throttled).toBe(true);
    expect(execResult.totalSpawned).toBe(0);
  });
});
