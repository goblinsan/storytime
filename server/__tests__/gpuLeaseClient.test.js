import { describe, expect, it, vi } from 'vitest';
import {
  GpuLeaseClient,
  GpuLeaseError,
  LeaseUnavailableError,
} from '../story-harness/gpuLeaseClient.js';
import { runOnce } from '../story-harness/worker.js';

describe('GpuLeaseClient', () => {
  it('reports isEnabled based on config presence', () => {
    const disabledClient = new GpuLeaseClient();
    expect(disabledClient.isEnabled()).toBe(false);

    const missingProfile = new GpuLeaseClient({ baseUrl: 'http://localhost:5404' });
    expect(missingProfile.isEnabled()).toBe(false);

    const explicitFalse = new GpuLeaseClient({
      baseUrl: 'http://localhost:5404',
      profileId: 'llm-papai-mistral-small-31-24b-q4km',
      enabled: false,
    });
    expect(explicitFalse.isEnabled()).toBe(false);

    const activeClient = new GpuLeaseClient({
      baseUrl: 'http://localhost:5404',
      profileId: 'llm-papai-mistral-small-31-24b-q4km',
    });
    expect(activeClient.isEnabled()).toBe(true);
  });

  it('acquires a lease successfully (acquire success)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'lease-123',
        node_id: 'gpu-papai',
        profile_id: 'llm-papai-mistral-small-31-24b-q4km',
        status: 'active',
      }),
    });

    const client = new GpuLeaseClient({
      baseUrl: 'http://lease-service:5404',
      profileId: 'llm-papai-mistral-small-31-24b-q4km',
      fetchFn: mockFetch,
    });

    const lease = await client.acquireLease({ reason: 'task-test' });
    expect(lease.id).toBe('lease-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://lease-service:5404/leases/acquire',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          profile_id: 'llm-papai-mistral-small-31-24b-q4km',
          owner: 'storytime-harness',
          priority: 500,
          ttl_seconds: 1800,
          preemptible: false,
          reason: 'task-test',
          wait_seconds: 0,
        }),
      }),
    );
  });

  it('throws LeaseUnavailableError on 409 and 423 (unavailable lease)', async () => {
    const mockFetch409 = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => 'No capacity on eligible nodes',
    });

    const client409 = new GpuLeaseClient({
      baseUrl: 'http://lease-service:5404',
      profileId: 'llm-papai-mistral-small-31-24b-q4km',
      fetchFn: mockFetch409,
    });

    await expect(client409.acquireLease()).rejects.toThrow(LeaseUnavailableError);
    await expect(client409.acquireLease()).rejects.toMatchObject({
      isRetryable: true,
      status: 409,
    });

    const mockFetch423 = vi.fn().mockResolvedValue({
      ok: false,
      status: 423,
      text: async () => 'Resource held for manual hold',
    });

    const client423 = new GpuLeaseClient({
      baseUrl: 'http://lease-service:5404',
      profileId: 'llm-papai-mistral-small-31-24b-q4km',
      fetchFn: mockFetch423,
    });

    await expect(client423.acquireLease()).rejects.toThrow(LeaseUnavailableError);
  });

  it('releases a lease and handles 404 gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'lease-123', status: 'released' }),
    });

    const client = new GpuLeaseClient({
      baseUrl: 'http://lease-service:5404',
      profileId: 'llm-papai-mistral-small-31-24b-q4km',
      fetchFn: mockFetch,
    });

    const res = await client.releaseLease('lease-123', { unload: false });
    expect(res.status).toBe('released');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://lease-service:5404/leases/lease-123/release',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ unload: false, restore_preempted: true }),
      }),
    );

    // Gracefully handle already released (404)
    const mockFetch404 = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const client404 = new GpuLeaseClient({
      baseUrl: 'http://lease-service:5404',
      profileId: 'llm-papai-mistral-small-31-24b-q4km',
      fetchFn: mockFetch404,
    });
    expect(await client404.releaseLease('lease-123')).toBe(null);
  });
});

describe('StoryTime Harness GPU Lease Workflow', () => {
  function makeHarnessMocks() {
    const task = {
      id: 795,
      title: 'Worldbuilding: Expand 50-year causal history',
      status: 'open',
      delegation_status: 'human_required',
      labels: ['storytime-generation', 'storytime-job:event_history_expansion'],
      priority_score: 685,
      description: "```json\n" + JSON.stringify({
        jobType: 'event_history_expansion',
        storytimeProjectId: 'proj-1',
        parentEventId: 'event-iron-accord',
        brief: 'Expand the causal chain.',
      }) + "\n```",
    };

    const dashboard = {
      listTasks: vi.fn().mockResolvedValue([task]),
      claimTask: vi.fn().mockResolvedValue(true),
      commentTask: vi.fn().mockResolvedValue(true),
      releaseTask: vi.fn().mockResolvedValue(true),
    };

    const store = {
      loadContext: vi.fn().mockResolvedValue({
        story: { id: 'proj-1', title: 'Test Story', promotion_policy: 'auto_accept' },
        characters: [],
        locations: [],
        factions: [],
        timelineEvents: [
          { id: 'event-iron-accord', title: 'The Iron Accord', date: 'Year 1000' },
        ],
        fixedTimelineFacts: [],
      }),
      insertGeneratedDraft: vi.fn().mockResolvedValue('draft-uuid-123'),
    };

    const validPayload = {
      jobType: 'event_history_expansion',
      schemaVersion: 1,
      parentEventId: 'event-iron-accord',
      timelineEvents: [
        {
          id: 'event-turning-point-1',
          date: 'Year 10 of the Siege',
          title: 'The Great Famine',
          summary: 'A harsh winter forced monks to open iron vaults for grain.',
        },
      ],
    };

    const llm = {
      generate: vi.fn().mockResolvedValue(validPayload),
      verifyHealth: vi.fn().mockResolvedValue(true),
    };

    return { task, dashboard, store, llm };
  }

  it('acquires lease and releases on success (release on success)', async () => {
    const { dashboard, store, llm } = makeHarnessMocks();

    const mockGpuLease = {
      isEnabled: () => true,
      acquireLease: vi.fn().mockResolvedValue({ id: 'lease-abc', status: 'active' }),
      releaseLease: vi.fn().mockResolvedValue({ id: 'lease-abc', status: 'released' }),
    };

    const result = await runOnce({
      dashboard,
      store,
      llm,
      gpuLease: mockGpuLease,
    });

    expect(result.processed).toBe(true);
    expect(mockGpuLease.acquireLease).toHaveBeenCalledTimes(1);
    expect(llm.verifyHealth).toHaveBeenCalledTimes(1);
    expect(llm.generate).toHaveBeenCalledTimes(1);
    expect(mockGpuLease.releaseLease).toHaveBeenCalledWith('lease-abc');
    expect(dashboard.releaseTask).toHaveBeenCalledWith('22', 795, 'storytime-harness', 'acceptance_review');
  });

  it('releases lease when generation fails (release on failure)', async () => {
    const { dashboard, store, llm } = makeHarnessMocks();
    llm.generate = vi.fn().mockRejectedValue(new Error('LLM internal server error 500'));

    const mockGpuLease = {
      isEnabled: () => true,
      acquireLease: vi.fn().mockResolvedValue({ id: 'lease-fail-1', status: 'active' }),
      releaseLease: vi.fn().mockResolvedValue({ id: 'lease-fail-1', status: 'released' }),
    };

    const result = await runOnce({
      dashboard,
      store,
      llm,
      gpuLease: mockGpuLease,
    });

    expect(result.processed).toBe(false);
    expect(mockGpuLease.acquireLease).toHaveBeenCalledTimes(1);
    expect(mockGpuLease.releaseLease).toHaveBeenCalledWith('lease-fail-1');
    expect(dashboard.releaseTask).toHaveBeenCalledWith('22', 795, 'storytime-harness', 'blocked');
  });

  it('postpones task and releases to open when lease is unavailable (unavailable lease)', async () => {
    const { dashboard, store, llm } = makeHarnessMocks();

    const mockGpuLease = {
      isEnabled: () => true,
      acquireLease: vi.fn().mockRejectedValue(new LeaseUnavailableError('GPU busy', 409)),
      releaseLease: vi.fn().mockResolvedValue(null),
    };

    const result = await runOnce({
      dashboard,
      store,
      llm,
      gpuLease: mockGpuLease,
    });

    expect(result.processed).toBe(false);
    expect(result.reason).toBe('lease_unavailable');
    // Task should NOT be called on LLM
    expect(llm.generate).not.toHaveBeenCalled();
    // Task must be released to 'open' for retry, NOT 'blocked'
    expect(dashboard.releaseTask).toHaveBeenCalledWith('22', 795, 'storytime-harness', 'open');
    expect(dashboard.commentTask).toHaveBeenCalledWith(
      '22',
      795,
      expect.stringContaining('postponed task: GPU lease unavailable'),
      'storytime-harness',
    );
  });

  it('runs smoothly when lease config is absent (no-lease config)', async () => {
    const { dashboard, store, llm } = makeHarnessMocks();

    const result = await runOnce({
      dashboard,
      store,
      llm,
      config: {}, // no GPU lease config
    });

    expect(result.processed).toBe(true);
    expect(llm.generate).toHaveBeenCalledTimes(1);
    expect(dashboard.releaseTask).toHaveBeenCalledWith('22', 795, 'storytime-harness', 'acceptance_review');
  });
});
