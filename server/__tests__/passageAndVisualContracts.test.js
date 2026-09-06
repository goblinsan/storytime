import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_JOB_TYPES } from '../story-harness/taskTypes.js';
import { buildScopedContextPack } from '../story-harness/contextPack.js';
import { validateLorePayload } from '../story-harness/consistencyGate.js';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const SELECTED = 'Malakor turned from the viewport without answering.';

const context = {
  story: { id: 'story-1', title: 'Void Requiem' },
  characters: [{ id: 'char-malakor', name: 'Malakor Vane' }],
  locations: [{ id: 'loc-nexus', name: 'Nexus Prime' }],
  factions: [{ id: 'fac-cinnabar', name: 'Cinnabar Scrap-Guild' }],
  timelineEvents: [{ id: 'event-fall', title: 'The Fall of Oakhaven' }],
};

const passagePayload = (overrides = {}) => ({
  jobType: SUPPORTED_JOB_TYPES.PASSAGE_REVISION_PREVIEW,
  schemaVersion: 1,
  canonDimension: 'derivative',
  locator: {
    workId: 'work-requiem',
    sectionId: 'chapter-3',
    startOffset: 1840,
    endOffset: 1889,
    selectedText: SELECTED,
    textSha256: sha256(SELECTED),
  },
  originalTextHash: sha256(SELECTED),
  replacementText: 'Malakor turned from the viewport, and said nothing at all.',
  rationale: 'The original repeats a beat from chapter two and flattens his refusal.',
  citedCanonIds: ['char-malakor', 'event-fall'],
  validationAssertions: [{ assertion: 'Malakor remains silent in this scene.', passed: true }],
  ...overrides,
});

const visualPayload = (overrides = {}) => ({
  jobType: SUPPORTED_JOB_TYPES.VISUAL_DESCRIPTION_FROM_IMAGE,
  schemaVersion: 1,
  canonDimension: 'encyclopedia',
  sourceAssetId: 'asset-malakor-portrait',
  subject: { type: 'character', id: 'char-malakor', name: 'Malakor Vane' },
  observableTraits: ['Chrome jaw plating', 'Deep red mantle'],
  inferredTraits: ['Late middle age', 'Recently wounded'],
  uncertainties: ['Left hand is out of frame'],
  proposedVisualDescription: 'A silver-jawed man in a deep red mantle, half-lit from below.',
  ...overrides,
});

describe('passage_revision_preview gate', () => {
  it('passes a conformant preview', () => {
    const result = validateLorePayload(passagePayload(), context, SUPPORTED_JOB_TYPES.PASSAGE_REVISION_PREVIEW);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a payload whose hash does not anchor to its locator', () => {
    const result = validateLorePayload(
      passagePayload({ originalTextHash: sha256('some other passage entirely') }),
      context,
      SUPPORTED_JOB_TYPES.PASSAGE_REVISION_PREVIEW,
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('hash_mismatch');
  });

  it('refuses to let a preview carry canon records', () => {
    const result = validateLorePayload(
      passagePayload({ characters: [{ id: 'char-new', name: 'Someone Invented' }] }),
      context,
      SUPPORTED_JOB_TYPES.PASSAGE_REVISION_PREVIEW,
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('canon_mutation_attempt');
  });

  it('rejects citations to entities outside the universe', () => {
    const result = validateLorePayload(
      passagePayload({ citedCanonIds: ['char-malakor', 'char-does-not-exist'] }),
      context,
      SUPPORTED_JOB_TYPES.PASSAGE_REVISION_PREVIEW,
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('unknown_reference');
  });

  it('rejects a replacement identical to the passage it replaces', () => {
    const result = validateLorePayload(
      passagePayload({ replacementText: SELECTED }),
      context,
      SUPPORTED_JOB_TYPES.PASSAGE_REVISION_PREVIEW,
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('no_op_revision');
  });

  it('rejects a malformed locator', () => {
    const result = validateLorePayload(
      passagePayload({ locator: { workId: 'work-requiem', sectionId: 'chapter-3', startOffset: 90, endOffset: 12, selectedText: SELECTED, textSha256: 'not-a-digest' } }),
      context,
      SUPPORTED_JOB_TYPES.PASSAGE_REVISION_PREVIEW,
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('invalid_locator');
  });
});

describe('visual_description_from_image gate', () => {
  it('passes a conformant description', () => {
    const result = validateLorePayload(visualPayload(), context, SUPPORTED_JOB_TYPES.VISUAL_DESCRIPTION_FROM_IMAGE);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a subject type outside the allowed set', () => {
    const result = validateLorePayload(
      visualPayload({ subject: { type: 'starship', id: 'ship-1', name: 'Iron Cinnabar' } }),
      context,
      SUPPORTED_JOB_TYPES.VISUAL_DESCRIPTION_FROM_IMAGE,
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('invalid_subject_type');
  });

  it('rejects a trait claimed as both seen and inferred', () => {
    const result = validateLorePayload(
      visualPayload({ inferredTraits: ['chrome jaw plating', 'Recently wounded'] }),
      context,
      SUPPORTED_JOB_TYPES.VISUAL_DESCRIPTION_FROM_IMAGE,
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('trait_classification_conflict');
  });

  it('requires the uncertainties key even when the model is confident', () => {
    const payload = visualPayload();
    delete payload.uncertainties;
    const result = validateLorePayload(payload, context, SUPPORTED_JOB_TYPES.VISUAL_DESCRIPTION_FROM_IMAGE);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.path)).toContain('$.uncertainties');
  });

  it('accepts an empty uncertainties list', () => {
    const result = validateLorePayload(
      visualPayload({ uncertainties: [] }),
      context,
      SUPPORTED_JOB_TYPES.VISUAL_DESCRIPTION_FROM_IMAGE,
    );
    expect(result.ok).toBe(true);
  });
});

describe('context packs for the new job types', () => {
  it('scopes a passage revision to the derivative dimension', () => {
    const pack = buildScopedContextPack(context, {
      jobType: SUPPORTED_JOB_TYPES.PASSAGE_REVISION_PREVIEW,
      mustReference: ['char-malakor'],
    });
    expect(pack.allowedDimensions).toEqual(['derivative']);
    expect(pack.characters.map((c) => c.id)).toContain('char-malakor');
  });

  it('anchors a visual description to its subject', () => {
    const pack = buildScopedContextPack(context, {
      jobType: SUPPORTED_JOB_TYPES.VISUAL_DESCRIPTION_FROM_IMAGE,
      targetEntityId: 'char-malakor',
    });
    expect(pack.allowedDimensions).toEqual(['encyclopedia']);
    expect(pack.anchorEntity?.entity?.id).toBe('char-malakor');
  });
});
