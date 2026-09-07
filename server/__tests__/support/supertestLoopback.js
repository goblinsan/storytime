/**
 * Make supertest listen on the address it then connects to.
 *
 * supertest starts the app with `app.listen(0)`, which binds the wildcard
 * address -- `::`, dual stack -- and then builds its URL as
 * `http://127.0.0.1:<port>`. Those are not the same address, and the operating
 * system will happily let a second process hold `127.0.0.1` on the very port it
 * just handed out for `::`, because the pair is what has to be unique. When
 * that happens the request goes to whatever else is listening, and the test
 * gets that program's answer.
 *
 * That is the intermittent failure this suite has had for days. Reproduced
 * directly: listen(0) took port 51486 on `::`, a second listener bound
 * 127.0.0.1:51486 without complaint, and a GET to 127.0.0.1:51486 came back
 * `401 {"error":"unauthorized"}` -- the exact status and body a run had
 * produced against `GET /api/locations`, a route that cannot return 401 and a
 * string that appears nowhere in this repository.
 *
 * It is intermittent because it needs the port the kernel offers to be one
 * some other daemon already holds on the loopback address. This machine runs
 * several that sit in the ephemeral range.
 *
 * Binding the loopback address explicitly closes it: the kernel will not hand
 * out a 127.0.0.1 port that is already taken, so the collision cannot happen
 * rather than happening rarely.
 */
import { Server as TlsServer } from 'node:tls';
import Test from 'supertest/lib/test.js';

const pendingListen = Symbol('loopback listen');
const boundApp = Symbol('loopback app');

/**
 * Binding a host is asynchronous -- node defers it a tick even for a literal
 * address -- while supertest wants the URL in its constructor. So the listen is
 * started here and the request is held until it has an address.
 */
Test.prototype.serverAddress = function serverAddress(app, path) {
  const existing = app.address();
  if (existing) {
    const protocol = app instanceof TlsServer ? 'https' : 'http';
    return `${protocol}://127.0.0.1:${existing.port}${path}`;
  }

  this._server = app.listen(0, '127.0.0.1');
  this[boundApp] = app;
  this[pendingListen] = new Promise((resolve, reject) => {
    this._server.once('listening', resolve);
    this._server.once('error', reject);
  });
  // Replaced once the port is known; nothing sends before then.
  this._loopbackPath = path;
  return '';
};

const originalEnd = Test.prototype.end;

Test.prototype.end = function end(callback) {
  const listening = this[pendingListen];
  if (!listening) return originalEnd.call(this, callback);
  this[pendingListen] = null;

  listening.then(
    () => {
      const app = this[boundApp];
      const protocol = app instanceof TlsServer ? 'https' : 'http';
      this.url = `${protocol}://127.0.0.1:${app.address().port}${this._loopbackPath}`;
      originalEnd.call(this, callback);
    },
    (error) => {
      if (callback) callback(error);
    },
  );

  // The contract superagent relies on: end() hands back the request itself,
  // and the callback fires whenever the response does.
  return this;
};
