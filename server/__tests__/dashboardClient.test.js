import { describe, expect, it } from 'vitest';
import { DashboardClient } from '../story-harness/dashboardClient.js';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

/** Records every request and serves pages of the given task list. */
const pagingFetch = (tasks, { envelope = true } = {}) => {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const query = new URL(url, 'http://dashboard.invalid').searchParams;
    const limit = Number(query.get('limit'));
    const offset = Number(query.get('offset') ?? 0);
    const page = tasks.slice(offset, offset + limit);
    return jsonResponse(envelope ? { data: page, meta: { total: tasks.length } } : page);
  };
  return { calls, impl };
};

const client = (fetchImpl, overrides = {}) =>
  new DashboardClient({ baseUrl: 'http://dashboard.invalid', token: 'test-token', fetchImpl, ...overrides });

const makeTasks = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    status: index % 3 === 0 ? 'open' : 'done',
    milestone_id: index < 50 ? 132 : 81,
  }));

describe('transport', () => {
  it('sends both auth headers when a token is present and neither when it is not', async () => {
    let headers = null;
    const capture = async (_url, options) => {
      headers = options.headers;
      return jsonResponse([]);
    };

    await client(capture).listTasks(22);
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['X-Control-Workflow-Token']).toBe('test-token');

    await client(capture, { token: '' }).listTasks(22);
    expect(headers.Authorization).toBeUndefined();
    expect(headers['X-Control-Workflow-Token']).toBeUndefined();
  });

  it('reports the status without leaking the response body', async () => {
    const leaky = async () => jsonResponse('{"error":"token sk-abc123 rejected"}', 401);
    await expect(client(leaky).getTask(22, 975)).rejects.toThrow(
      'dashboard GET /projects/22/tasks/975 failed: 401',
    );
    await expect(client(leaky).getTask(22, 975)).rejects.not.toThrow(/sk-abc123/);
  });

  it('refuses a 200 that is not JSON instead of reading it as an empty result', async () => {
    const proxyPage = async () => jsonResponse('<html><body>502 Bad Gateway</body></html>');
    await expect(client(proxyPage).listTasks(22)).rejects.toThrow(/non_json_response/);
  });

  it('aborts on timeout', async () => {
    const never = (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expect(client(never, { timeoutMs: 20 }).listTasks(22)).rejects.toThrow(/timeout/);
  });
});

describe('listTasks', () => {
  it('follows pagination instead of stopping at the first page', async () => {
    const tasks = makeTasks(430);
    const { impl, calls } = pagingFetch(tasks);

    const result = await client(impl).listTasks(22);

    expect(result).toHaveLength(430);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0]).toContain('offset=0');
  });

  it('sends only the query parameters the API implements', async () => {
    const { impl, calls } = pagingFetch(makeTasks(10));
    await client(impl).listTasks(22, { status: 'open', milestone_id: 132 });

    for (const url of calls) {
      const query = new URL(url, 'http://dashboard.invalid').searchParams;
      // The dashboard documents projectId, limit and offset on this route and
      // ignores anything else, so a status or milestone filter sent as a query
      // silently returns the whole project.
      expect([...query.keys()].sort()).toEqual(['limit', 'offset']);
    }
  });

  it('filters by status and milestone on the rows it fetched', async () => {
    const { impl } = pagingFetch(makeTasks(120));

    const open = await client(impl).listTasks(22, { status: 'open' });
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((task) => task.status === 'open')).toBe(true);

    const milestone = await client(impl).listTasks(22, { milestone_id: 132 });
    expect(milestone).toHaveLength(50);
    expect(milestone.every((task) => task.milestone_id === 132)).toBe(true);

    const both = await client(impl).listTasks(22, { status: 'open', milestone_id: '132' });
    expect(both.every((task) => task.status === 'open' && task.milestone_id === 132)).toBe(true);
  });

  it('honours an explicit limit as a fetch ceiling', async () => {
    const { impl } = pagingFetch(makeTasks(430));
    expect(await client(impl).listTasks(22, { limit: 5 })).toHaveLength(5);
  });

  it('handles a bare array response with no envelope', async () => {
    const { impl } = pagingFetch(makeTasks(30), { envelope: false });
    expect(await client(impl).listTasks(22)).toHaveLength(30);
  });

  it('reports whether a page has more behind it', async () => {
    const { impl } = pagingFetch(makeTasks(430));
    const page = await client(impl).listTaskPage(22, { limit: 200, offset: 0 });

    expect(page.tasks).toHaveLength(200);
    expect(page.total).toBe(430);
    expect(page.hasMore).toBe(true);
  });
});

describe('writes', () => {
  it('claims, comments on and releases a task with the expected bodies', async () => {
    const calls = [];
    const impl = async (url, options) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : null, method: options.method });
      return jsonResponse({ ok: true });
    };
    const dashboard = client(impl);

    await dashboard.claimTask(22, 975, 'storytime-harness', 900);
    await dashboard.commentTask(22, 975, 'delivered');
    await dashboard.releaseTask(22, 975, 'storytime-harness', 'acceptance_review');

    expect(calls[0].url).toContain('/projects/22/tasks/975/claim');
    expect(calls[0].body).toEqual({ agent: 'storytime-harness', status: 'in_progress', lease_seconds: 900 });
    expect(calls[1].body.tag).toBe('storytime-harness');
    expect(calls[2].body).toEqual({ agent: 'storytime-harness', status: 'acceptance_review' });
    expect(calls.every((call) => call.method === 'POST')).toBe(true);
  });
});
