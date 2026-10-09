/**
 * Loopback HTTP endpoint for the plugin's browser half.
 *
 * Two reads share one listener because they share one lifetime and one port
 * setting:
 *
 * - `/notify` is the small change summary the toast polls.
 * - `/state` is the fuller snapshot the settings page renders: the available
 *   free models, the recent catalog changes, and the token totals.
 *
 * Keeping both on the plugin's own loopback port is what lets the settings page
 * show host-side facts without the page having to own a Remote namespace of its
 * own.
 *
 * @module dsh-llm-kilo-gateway/server
 */

import { createServer } from 'node:http';

/**
 * Start the notification HTTP server on an exact port.
 *
 * The port is *not* negotiated. The browser half addresses the endpoint by the
 * configured port, so a server that quietly bound a different one would leave
 * the poller talking to nothing — a silent failure of the whole notification
 * path. A port that cannot be bound therefore rejects, and the caller reports
 * it and leaves the endpoint off until the setting changes.
 *
 * @param {number} port - port to listen on; a non-positive port disables the endpoint.
 * @param {() => object} getNotify - returns the current toast payload.
 * @param {() => object} [getState] - returns the settings-page snapshot.
 * @returns {Promise<{server: import('node:http').Server, port: number, close: () => Promise<void>}>}
 */
export async function startNotifyServer(port, getNotify, getState) {
  if (port <= 0) {
    return {
      server: null,
      port: 0,
      close: async () => {}
    };
  }

  /**
   * The headers every response carries, success or not.
   *
   * The page that polls this endpoint is served from a different origin (a
   * different loopback port), so *every* answer is cross-origin and none of them
   * is readable without `Access-Control-Allow-Origin`. Sending it only on 200
   * was a real bug: a 404 came back without the header, the browser blocked the
   * whole response, and `fetch` rejected with a bare «Failed to fetch» — the
   * status code that would have identified the fault (an older plugin build
   * with no `/state` route) was erased before the page could read it.
   */
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };

  /**
   * Write one response, always with the CORS headers applied.
   * @param res - the response to write.
   * @param status - HTTP status.
   * @param body - response body.
   * @param contentType - body's content type.
   */
  const respond = (res, status, body, contentType = 'text/plain') => {
    res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': contentType });
    res.end(body);
  };

  const json = (res, body) => respond(res, 200, JSON.stringify(body), 'application/json');

  const server = createServer((req, res) => {
    // The path may carry a query string; only the path selects a route.
    const path = (req.url ?? '').split('?')[0];

    if (req.method === 'GET' && (path === '/' || path === '/notify')) {
      json(res, getNotify());
      return;
    }
    if (req.method === 'GET' && path === '/state') {
      if (getState === undefined) {
        respond(res, 404, 'Not Found');
        return;
      }
      json(res, getState());
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...CORS_HEADERS,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        // A browser on a public origin reaching a loopback address asks for this
        // during preflight; answering it is what keeps the private-network check
        // from blocking a page that is legitimately talking to its own host.
        'Access-Control-Allow-Private-Network': 'true'
      });
      res.end();
      return;
    }
    respond(res, 404, 'Not Found');
  });

  // A listen failure rejects rather than falling back to an ephemeral port, and
  // the listener is removed once the bind settles so a later runtime error is
  // not delivered to a promise that already resolved.
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });

  return {
    server,
    port: server.address().port,
    close: async () => {
      await new Promise(resolve => server.close(resolve));
    }
  };
}
