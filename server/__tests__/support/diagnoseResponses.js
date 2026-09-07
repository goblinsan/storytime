/**
 * Record every failing HTTP response the suite receives, with its body.
 *
 * The suite fails intermittently, in a different route file each time, always
 * the same shape: a create quietly returns something without an id, and the
 * next assertion reports the symptom -- a 404 on `/api/paths/undefined`, a 403,
 * a 401. Four theories have died for lack of the one thing nobody has looked
 * at, which is what the failing request actually said.
 *
 * Off unless STORYTIME_DIAGNOSE is set, so a normal run is unchanged.
 */
import { appendFileSync } from 'node:fs';
import Test from 'supertest/lib/test.js';
import { afterEach, beforeEach } from 'vitest';

const target = process.env.STORYTIME_DIAGNOSE;

if (target) {
  let current = 'unknown test';
  beforeEach((context) => { current = context?.task?.name ?? 'unknown test'; });
  afterEach(() => { current = 'between tests'; });

  const originalEnd = Test.prototype.end;
  Test.prototype.end = function end(callback) {
    return originalEnd.call(this, (error, response) => {
      // A 4xx a test is asserting on is normal; what matters is the whole
      // sequence leading to a failure, so everything non-2xx is recorded and
      // read backwards from the failure.
      if (response && (response.status < 200 || response.status >= 300)) {
        const body = (() => {
          try { return JSON.stringify(response.body).slice(0, 400); } catch { return '<unserialisable>'; }
        })();
        appendFileSync(target, `${new Date().toISOString()} | ${current} | `
          + `${this.req?.method} ${this.req?.path} -> ${response.status} | ${body}\n`);
      }
      if (error) {
        appendFileSync(target, `${new Date().toISOString()} | ${current} | `
          + `${this.req?.method} ${this.req?.path} -> TRANSPORT ERROR ${error.message}\n`);
      }
      if (callback) callback(error, response);
    });
  };
}
