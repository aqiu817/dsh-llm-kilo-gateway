/**
 * Notification-endpoint tests.
 *
 * The endpoint's one non-obvious contract is that it binds an *exact* port and
 * rejects when it cannot. The browser half addresses it by the configured port,
 * so a server that fell back to an ephemeral port would leave the poller talking
 * to nothing — the whole notification path failing silently, which is exactly
 * the kind of bug that never shows up in a log.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startNotifyServer } from '../lib/server.js';

/**
 * Each test gets its own port.
 *
 * Every test here starts a server and closes it, and `fetch` keeps a pooled
 * keep-alive connection keyed by origin. Reusing one port across the file
 * therefore let undici hand a later test a socket belonging to a server that
 * had already been closed, which surfaced as a bare `fetch failed`
 * (`UND_ERR_SOCKET: other side closed`) on the first request of a test — a
 * test-isolation artifact, not an endpoint fault. The endpoint itself is a
 * single long-lived server whose port changes only with the setting.
 */
let nextPort = 19876;
/** A port unique to one test, or to one pair of binds within a test. */
const allocPort = () => nextPort++;

test('a non-positive port disables the endpoint without listening', async () => {
  const handle = await startNotifyServer(0, () => ({}));
  assert.equal(handle.server, null);
  assert.equal(handle.port, 0);
  await handle.close();
});

test('the endpoint serves the current payload as JSON', async () => {
  const PORT = allocPort();
  const payload = { hasChanges: true, added: ['new/free'], removed: [], totalFree: 3, fetchedAt: 1 };
  const handle = await startNotifyServer(PORT, () => payload);
  try {
    assert.equal(handle.port, PORT, 'the endpoint must bind the port it was given');
    const response = await fetch(`http://127.0.0.1:${PORT}/notify`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), payload);
  } finally {
    await handle.close();
  }
});

test('the endpoint answers CORS preflight and 404s everything else', async () => {
  const PORT = allocPort();
  const handle = await startNotifyServer(PORT, () => ({}));
  try {
    const preflight = await fetch(`http://127.0.0.1:${PORT}/notify`, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    const missing = await fetch(`http://127.0.0.1:${PORT}/unknown`);
    assert.equal(missing.status, 404);
  } finally {
    await handle.close();
  }
});

test('every response carries CORS headers, including the failures', async () => {
  const PORT = allocPort();
  // The page is served from a different loopback origin, so *no* answer is
  // readable without `Access-Control-Allow-Origin`. Sending it only on 200 was a
  // real bug: an older plugin build answers `/state` with a bare 404, the browser
  // blocked the response for want of the header, and `fetch` rejected with a
  // context-free «Failed to fetch» — hiding the status code that named the fault.
  const handle = await startNotifyServer(PORT, () => ({ ok: true }), () => ({ state: true }));
  try {
    for (const path of ['/notify', '/state', '/unknown-route']) {
      const response = await fetch(`http://127.0.0.1:${PORT}${path}`, { headers: { Origin: 'http://127.0.0.1:3080' } });
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        '*',
        `${path} answered ${response.status} without CORS headers, which the browser would block entirely`
      );
    }
  } finally {
    await handle.close();
  }
});

test('the state route is served when a snapshot provider is supplied', async () => {
  const PORT = allocPort();
  const state = { fetchedAt: 1, lastFetchSucceeded: true, models: [{ id: 'm/free' }], changeLog: [], tokenStats: {} };
  const handle = await startNotifyServer(PORT, () => ({}), () => state);
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/state`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), state);
  } finally {
    await handle.close();
  }
});

test('a deployment with no state provider answers 404 readably rather than unreadably', async () => {
  const PORT = allocPort();
  // Without a snapshot provider the route does not exist. The 404 still has to
  // carry CORS headers, or the page cannot tell "no such route" apart from
  // "network is down" — which is the whole point of the fix above.
  const handle = await startNotifyServer(PORT, () => ({}));
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/state`, { headers: { Origin: 'http://127.0.0.1:3080' } });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  } finally {
    await handle.close();
  }
});

test('the preflight answer allows the private-network check', async () => {
  const PORT = allocPort();
  // A page on a public origin reaching a loopback address has to be granted this
  // during preflight, or the browser drops a request that is legitimately
  // talking to its own host.
  const handle = await startNotifyServer(PORT, () => ({}), () => ({}));
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/state`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:3080',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Private-Network': 'true'
      }
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-private-network'), 'true');
  } finally {
    await handle.close();
  }
});

test('a port that cannot be bound rejects instead of moving to another one', async () => {
  const PORT = allocPort();
  const first = await startNotifyServer(PORT, () => ({}));
  try {
    await assert.rejects(
      () => startNotifyServer(PORT, () => ({})),
      (error) => error.code === 'EADDRINUSE',
      'an ephemeral fallback would leave the browser half polling the configured port forever'
    );
  } finally {
    await first.close();
  }
});

test('closing releases the port for a later bind', async () => {
  const PORT = allocPort();
  const first = await startNotifyServer(PORT, () => ({}));
  await first.close();
  // A rebind on the same port proves the listener was actually released, which
  // is what lets a settings edit restart the endpoint.
  const second = await startNotifyServer(PORT, () => ({}));
  await second.close();
});
