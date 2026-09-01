export class GpuLeaseError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'GpuLeaseError';
    this.status = status;
    this.isRetryable = false;
  }
}

export class LeaseUnavailableError extends GpuLeaseError {
  constructor(message, status = 409) {
    super(message, status);
    this.name = 'LeaseUnavailableError';
    this.isRetryable = true;
  }
}

export class GpuLeaseClient {
  constructor({
    baseUrl,
    profileId,
    owner = 'storytime-harness',
    priority = 500,
    ttlSeconds = 1800,
    unloadOnRelease = false,
    enabled = true,
    fetchFn = globalThis.fetch,
  } = {}) {
    this.baseUrl = baseUrl ? String(baseUrl).replace(/\/+$/, '') : '';
    this.profileId = profileId ? String(profileId).trim() : '';
    this.owner = String(owner || 'storytime-harness');
    this.priority = Number(priority ?? 500);
    this.ttlSeconds = Number(ttlSeconds ?? 1800);
    this.unloadOnRelease = Boolean(unloadOnRelease);
    this.enabled = Boolean(enabled);
    this.fetchFn = fetchFn;
  }

  isEnabled() {
    return Boolean(this.enabled && this.baseUrl && this.profileId);
  }

  async acquireLease({ reason = '', waitSeconds = 0 } = {}) {
    if (!this.isEnabled()) return null;

    const url = `${this.baseUrl}/leases/acquire`;
    const payload = {
      profile_id: this.profileId,
      owner: this.owner,
      priority: this.priority,
      ttl_seconds: this.ttlSeconds,
      preemptible: false,
      reason: reason || 'StoryTime generation harness workload',
      wait_seconds: waitSeconds,
    };

    let response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new LeaseUnavailableError(
        `Failed to reach GPU lease service at ${this.baseUrl}: ${err.message}`,
        503,
      );
    }

    if (response.status === 409 || response.status === 423) {
      const text = await response.text().catch(() => '');
      throw new LeaseUnavailableError(
        `GPU lease profile ${this.profileId} unavailable (status ${response.status}): ${text}`,
        response.status,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GpuLeaseError(
        `GPU lease acquire failed (status ${response.status}): ${text}`,
        response.status,
      );
    }

    return response.json();
  }

  async renewLease(leaseId) {
    if (!this.isEnabled() || !leaseId) return null;

    const url = `${this.baseUrl}/leases/${encodeURIComponent(leaseId)}/renew`;
    const response = await this.fetchFn(url, { method: 'POST' });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GpuLeaseError(
        `Failed to renew GPU lease ${leaseId} (status ${response.status}): ${text}`,
        response.status,
      );
    }
    return response.json();
  }

  async releaseLease(leaseId, { unload, restorePreempted = true } = {}) {
    if (!this.isEnabled() || !leaseId) return null;

    const url = `${this.baseUrl}/leases/${encodeURIComponent(leaseId)}/release`;
    const payload = {
      unload: unload !== undefined ? unload : this.unloadOnRelease,
      restore_preempted: restorePreempted,
    };

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 404) {
        // Already released or expired
        return null;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.warn(`[GpuLeaseClient] release warning (status ${response.status}): ${text}`);
        return null;
      }

      return response.json();
    } catch (err) {
      console.warn(`[GpuLeaseClient] release network error: ${err.message}`);
      return null;
    }
  }
}
