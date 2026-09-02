import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resolvePromotionPolicy,
  isTrustedOperator,
  detectShadowEntityCollision,
  VALID_PROMOTION_POLICIES,
} from '../story-harness/policyEngine.js';

describe('StoryTime Autonomy Policy Engine', () => {
  const originalEnv = process.env.STORYTIME_HARNESS_AUTO_PROMOTE;

  beforeEach(() => {
    process.env.STORYTIME_HARNESS_AUTO_PROMOTE = '1';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.STORYTIME_HARNESS_AUTO_PROMOTE = originalEnv;
    } else {
      delete process.env.STORYTIME_HARNESS_AUTO_PROMOTE;
    }
  });

  const baseStory = {
    id: 'proj-1',
    title: 'Void Requiem',
    promotion_policy: 'auto_promote',
    is_protected: false,
  };

  const baseContext = {
    characters: [
      { id: 'char-vane', name: 'Lord Malakor Vane', is_protected: true },
      { id: 'char-grunt', name: 'Scrap Grunt', is_protected: false },
    ],
    factions: [
      { id: 'fac-vander-thorne', name: 'Vander-Thorne Orbital Cartel', is_protected: true },
      { id: 'fac-free-scavs', name: 'Free Scavengers', is_protected: false },
    ],
    locations: [],
    timelineEvents: [],
    canonRelationships: [],
    bestiary: [
      { id: 'beast-void-crawler', name: 'Void Crawler' },
    ],
  };

  it('defaults new exploratory projects to auto_promote for create-only jobs', () => {
    const res = resolvePromotionPolicy({
      story: baseStory,
      taskMetadata: {
        jobType: 'draft_campaign_asset_bundle',
        brief: 'Build initial rim world.',
      },
      context: baseContext,
    });

    expect(res.policy).toBe('auto_promote');
    expect(res.reason).toBe('project_default');
  });

  it('allows read-only mustReference to cite protected entities without manual escalation', () => {
    const res = resolvePromotionPolicy({
      story: baseStory,
      taskMetadata: {
        jobType: 'star_system_refinement',
        mustReference: ['char-vane', 'fac-vander-thorne'],
      },
      context: baseContext,
    });

    expect(res.policy).toBe('auto_promote');
  });

  it('strictly forces manual when mayUpdate targets a protected entity', () => {
    const res = resolvePromotionPolicy({
      story: baseStory,
      taskMetadata: {
        jobType: 'faction_politics_refinement',
        mayUpdate: ['fac-vander-thorne'],
      },
      context: baseContext,
    });

    expect(res.policy).toBe('manual');
    expect(res.reason).toBe('protected_canon_mutation_requires_review');
  });

  it('fails closed to manual if mayUpdate is omitted on a mutation-capable job', () => {
    const res = resolvePromotionPolicy({
      story: baseStory,
      taskMetadata: {
        jobType: 'faction_politics_refinement',
        // mayUpdate missing!
      },
      context: baseContext,
    });

    expect(res.policy).toBe('manual');
    expect(res.reason).toBe('fail_closed_missing_may_update');
  });

  it('allows auto_promote when mayUpdate targets only unprotected entities', () => {
    const res = resolvePromotionPolicy({
      story: baseStory,
      taskMetadata: {
        jobType: 'faction_politics_refinement',
        mayUpdate: ['fac-free-scavs'],
      },
      context: baseContext,
    });

    expect(res.policy).toBe('auto_promote');
  });

  it('fails closed to manual if a new entity attempts shadow-name collision against protected entity', () => {
    const res = resolvePromotionPolicy({
      story: baseStory,
      taskMetadata: {
        jobType: 'draft_campaign_asset_bundle',
        mayCreate: [{ name: '  lord malakor vane  ' }], // Collides with char-vane
      },
      context: baseContext,
    });

    expect(res.policy).toBe('manual');
    expect(res.reason).toBe('protected_canon_mutation_requires_review');
  });

  it('rejects forged protectedOverride from untrusted task description JSON', () => {
    const untrustedTask = {
      id: 999,
      // No server creator or created by harvester
      created_by: 'storytime-harvester',
    };

    const taskMetadata = {
      jobType: 'faction_politics_refinement',
      mayUpdate: ['fac-vander-thorne'],
      authorSource: 'operator', // Forgery claim!
      protectedOverride: true,
    };

    const res = resolvePromotionPolicy({
      story: baseStory,
      task: untrustedTask,
      taskMetadata,
      context: baseContext,
    });

    expect(res.policy).toBe('manual');
    expect(res.reason).toBe('protected_canon_mutation_requires_review');
  });

  it('honors protectedOverride when verified as server-side operator task', () => {
    const trustedOperatorTask = {
      id: 1000,
      creator: 'operator',
    };

    const taskMetadata = {
      jobType: 'faction_politics_refinement',
      mayUpdate: ['fac-vander-thorne'],
      protectedOverride: true,
    };

    const res = resolvePromotionPolicy({
      story: baseStory,
      task: trustedOperatorTask,
      taskMetadata,
      context: baseContext,
    });

    expect(res.policy).toBe('auto_promote');
    expect(res.reason).toBe('trusted_operator_protected_override');
  });

  it('fails closed to manual if payload attempts to mutate append-only bestiary', () => {
    const payload = {
      bestiary: [
        { id: 'beast-void-crawler', name: 'Mutated Void Crawler' }, // Mutates existing
      ],
    };

    const res = resolvePromotionPolicy({
      story: baseStory,
      taskMetadata: {
        jobType: 'draft_campaign_asset_bundle',
      },
      context: baseContext,
      generatedPayload: payload,
    });

    expect(res.policy).toBe('manual');
    expect(res.reason).toBe('append_only_table_mutation_disallowed');
  });

  it('defaults chapter_prose_composition to auto_accept', () => {
    const res = resolvePromotionPolicy({
      story: baseStory,
      taskMetadata: {
        jobType: 'chapter_prose_composition',
      },
      context: baseContext,
    });

    expect(res.policy).toBe('auto_accept');
    expect(res.reason).toBe('job_type_default');
  });

  it('downgrades auto_promote to auto_accept when global master switch is disabled', () => {
    process.env.STORYTIME_HARNESS_AUTO_PROMOTE = '0';

    const res = resolvePromotionPolicy({
      story: baseStory,
      taskMetadata: {
        jobType: 'draft_campaign_asset_bundle',
      },
      context: baseContext,
    });

    expect(res.policy).toBe('auto_accept');
  });

  it('rejects quarantine as an input policy', () => {
    expect(() =>
      resolvePromotionPolicy({
        story: baseStory,
        taskMetadata: {
          jobType: 'draft_campaign_asset_bundle',
          promotionPolicy: 'quarantine',
        },
        context: baseContext,
      }),
    ).toThrow(/quarantine.*runtime outcome/);
  });
});
