/**
 * Reusable StoryTime Project Dashboard Client
 *
 * Provides typed, bounded HTTP interactions with project-dashboard.
 * Enforces a 30-second request timeout, safe JSON parsing, and strict error sanitization
 * that prevents response bodies, credentials, or secret-bearing headers from leaking into errors.
 */

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_PAGE_SIZE = 200;
// A stop so a paging bug cannot walk a project forever. Well above the largest
// project on the board; raise it rather than letting a caller silently truncate.
const MAX_TASKS = 5000;

export class DashboardClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl] - Base URL of project-dashboard (or from env)
   * @param {string|null} [options.token] - Auth token (or from env)
   * @param {Function} [options.fetchImpl] - Injected fetch implementation for tests
   * @param {number} [options.timeoutMs] - Request timeout in milliseconds (defaults to 30000)
   */
  constructor({ baseUrl, token = null, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const rawUrl = baseUrl || process.env.DASHBOARD_BASE_URL || process.env.DASHBOARD_URL;
    if (!rawUrl) {
      throw new Error('DASHBOARD_BASE_URL is required');
    }
    this.baseUrl = String(rawUrl).replace(/\/+$/, '');
    this.token =
      token ??
      process.env.DASHBOARD_API_TOKEN ??
      process.env.DASHBOARD_CONTROL_WORKFLOW_TOKEN ??
      process.env.DASHBOARD_TOKEN ??
      process.env.DASHBOARD_API_KEY ??
      process.env.CONTROL_WORKFLOW_TOKEN ??
      '';
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  }

  /**
   * Internal sanitized HTTP request helper.
   * Throws status-only errors without exposing response bodies or auth headers.
   *
   * @private
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   * @returns {Promise<any>}
   */
  async request(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
      headers['X-Control-Workflow-Token'] = this.token;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (networkError) {
      if (controller.signal.aborted) {
        throw new Error(`dashboard ${method} ${path} failed: timeout`);
      }
      throw new Error(`dashboard ${method} ${path} failed: network_error`);
    } finally {
      clearTimeout(timer);
    }

    let text = '';
    try {
      text = await response.text();
    } catch {
      text = '';
    }

    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      // Intentionally omit response body to prevent credential or raw leak
      throw new Error(`dashboard ${method} ${path} failed: ${response.status}`);
    }

    // A 200 carrying something that is not JSON is a proxy or gateway page, not
    // an empty result. Returning null here made "no tasks" and "the response
    // was not from the dashboard" indistinguishable to every caller.
    if (text && parsed === null) {
      throw new Error(`dashboard ${method} ${path} failed: non_json_response`);
    }

    return parsed;
  }

  /**
   * Fetch one page of tasks for a dashboard project.
   *
   * The dashboard API supports only limit and offset on this route
   * (GET /openapi.json documents projectId, limit and offset, and nothing
   * else), so any filtering happens here rather than being sent as a query the
   * server silently ignores.
   *
   * @param {string|number} projectId
   * @param {Object} [options]
   * @param {number} [options.limit]
   * @param {number} [options.offset]
   * @returns {Promise<{ tasks: Array<any>, total: number|null, hasMore: boolean }>}
   */
  async listTaskPage(projectId, { limit = DEFAULT_PAGE_SIZE, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const result = await this.request('GET', `/projects/${projectId}/tasks?${params.toString()}`);

    const tasks = Array.isArray(result) ? result : (result?.data ?? []);
    const total = Number.isFinite(result?.meta?.total) ? result.meta.total : null;

    return {
      tasks,
      total,
      hasMore: total === null ? tasks.length === limit : offset + tasks.length < total,
    };
  }

  /**
   * List tasks for a dashboard project, following pagination to the end.
   *
   * Filters are applied to the fetched rows, not sent to the server. Passing
   * an explicit `limit` fetches at most that many rows before filtering.
   *
   * @param {string|number} projectId
   * @param {Object} [options]
   * @param {number} [options.limit] - Stop after this many rows are fetched.
   * @param {string} [options.status] - Keep only tasks in this status.
   * @param {string|number} [options.milestone_id] - Keep only tasks on this milestone.
   * @returns {Promise<Array<any>>}
   */
  async listTasks(projectId, options = {}) {
    const { limit = null, status = null, milestone_id: milestoneId = null } = options ?? {};

    const collected = [];
    let offset = 0;

    for (;;) {
      const remaining = limit === null ? DEFAULT_PAGE_SIZE : Math.min(DEFAULT_PAGE_SIZE, limit - collected.length);
      if (remaining <= 0) break;

      const page = await this.listTaskPage(projectId, { limit: remaining, offset });
      collected.push(...page.tasks);
      offset += page.tasks.length;

      if (!page.hasMore || page.tasks.length === 0) break;
      if (offset >= MAX_TASKS) break;
    }

    return collected.filter((task) => {
      if (status !== null && task?.status !== status) return false;
      if (milestoneId !== null && String(task?.milestone_id ?? task?.milestone?.id ?? '') !== String(milestoneId)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Fetch a single task by ID.
   *
   * @param {string|number} projectId
   * @param {string|number} taskId
   * @returns {Promise<any>}
   */
  async getTask(projectId, taskId) {
    const result = await this.request('GET', `/projects/${projectId}/tasks/${taskId}`);
    return result?.data ?? result;
  }

  /**
   * List milestones for a dashboard project.
   *
   * @param {string|number} projectId
   * @returns {Promise<Array<any>>}
   */
  async listMilestones(projectId) {
    const result = await this.request('GET', `/projects/${projectId}/milestones`);
    return result?.data ?? result ?? [];
  }

  /**
   * Create a new task in a dashboard project.
   *
   * @param {string|number} projectId
   * @param {Object} body
   * @returns {Promise<any>}
   */
  async createTask(projectId, body) {
    return this.request('POST', `/projects/${projectId}/tasks`, body);
  }

  /**
   * Claim a task for in_progress execution.
   *
   * @param {string|number} projectId
   * @param {string|number} taskId
   * @param {string} agent
   * @param {number} [leaseSeconds]
   * @returns {Promise<any>}
   */
  async claimTask(projectId, taskId, agent, leaseSeconds) {
    const body = {
      agent,
      status: 'in_progress',
    };
    if (leaseSeconds !== undefined) {
      body.lease_seconds = leaseSeconds;
    }
    return this.request('POST', `/projects/${projectId}/tasks/${taskId}/claim`, body);
  }

  /**
   * Post an append-only comment on a dashboard task.
   *
   * @param {string|number} projectId
   * @param {string|number} taskId
   * @param {string} body
   * @param {string} [agent]
   * @returns {Promise<any>}
   */
  async commentTask(projectId, taskId, body, agent = 'storytime-harness') {
    return this.request('POST', `/projects/${projectId}/tasks/${taskId}/comments`, {
      author: agent,
      tag: 'storytime-harness',
      body,
    });
  }

  /**
   * Release hold on a dashboard task and update its lifecycle status.
   *
   * @param {string|number} projectId
   * @param {string|number} taskId
   * @param {string} agent
   * @param {string} status
   * @returns {Promise<any>}
   */
  async releaseTask(projectId, taskId, agent, status) {
    return this.request('POST', `/projects/${projectId}/tasks/${taskId}/release`, {
      agent,
      status,
    });
  }
}

export default DashboardClient;
