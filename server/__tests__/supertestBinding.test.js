/**
 * supertest must listen on the address it connects to.
 *
 * It builds its URL as `http://127.0.0.1:<port>` but starts the server with
 * `app.listen(0)`, which binds the wildcard address. Those are different
 * addresses, and the kernel will hand out a port for `::` that another process
 * already holds on `127.0.0.1`, because the address-port pair is what has to be
 * unique. The request then goes to that other program.
 *
 * That was this suite's intermittent failure. A run got
 * `401 {"error":"unauthorized"}` from `GET /api/locations` -- a route with no
 * 401 in it, and a string that appears nowhere in this repository. Reproduced
 * on purpose: listen(0) took 51486 on `::`, a second listener bound
 * 127.0.0.1:51486 without complaint, and a GET to it returned the squatter's
 * answer.
 *
 * server/__tests__/support/supertestLoopback.js binds loopback explicitly so
 * the kernel refuses a port already in use there. This checks the patch is in
 * force, because without it the failure comes back as something that looks
 * like a database race and costs days.
 */
import express from 'express';
import http from 'node:http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

const app = express();
app.get('/bound', (_req, res) => res.json({ ok: true }));

describe('supertest binds the loopback address', () => {
  it('reaches the app it was given', async () => {
    const res = await request(app).get('/bound').expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  /**
   * The address has to be read while the server is up: supertest closes it as
   * soon as the response lands, and `address()` is null after that.
   */
  const addressWhileListening = async () => {
    const test = request(app).get('/bound');
    const seen = new Promise((resolve) => {
      test._server.once('listening', () => resolve(test._server.address()));
    });
    const [address] = await Promise.all([seen, test]);
    return address;
  };

  it('listens on 127.0.0.1 rather than the wildcard address', async () => {
    const address = await addressWhileListening();
    expect(address.address, 'the wildcard address lets another process take the same port')
      .toBe('127.0.0.1');
    expect(address.family).toBe('IPv4');
  });

  it('makes the port impossible for another process to hold', async () => {
    const test = request(app).get('/bound');
    const outcome = new Promise((resolve) => {
      test._server.once('listening', () => {
        const { port } = test._server.address();
        const squatter = http.createServer(() => {});
        squatter.once('error', (error) => resolve(error.code));
        squatter.listen(port, '127.0.0.1', () => { squatter.close(); resolve('bound'); });
      });
    });
    const [result] = await Promise.all([outcome, test]);
    // The whole point: with the wildcard bind this comes back 'bound', and any
    // request afterwards can land on the squatter instead of the app.
    expect(result).toBe('EADDRINUSE');
  });

  /**
   * The hazard itself, stated so it cannot quietly stop being true.
   *
   * If a future node or kernel refuses this bind, the patch is no longer load
   * bearing and this test says so rather than leaving it as folklore.
   */
  it('is guarding against a collision the platform really does allow', async () => {
    const wildcard = http.createServer((_req, res) => res.end('ours'));
    await new Promise((resolve) => wildcard.listen(0, resolve));
    const { port, address } = wildcard.address();
    expect(address, 'a hostless listen binds the wildcard address').toBe('::');

    const squatter = http.createServer((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
    });
    const bound = await new Promise((resolve) => {
      squatter.once('error', (error) => resolve(error.code));
      squatter.listen(port, '127.0.0.1', () => resolve('bound'));
    });

    // This is what happened: the kernel hands out a wildcard port that another
    // process already holds on loopback, and supertest's own URL goes there.
    expect(bound).toBe('bound');
    const answered = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(`${res.statusCode} ${body}`));
      }).on('error', (error) => resolve(error.code));
    });
    expect(answered).toBe('401 {"error":"unauthorized"}');

    squatter.close();
    wildcard.close();
  });
});
