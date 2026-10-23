/**
 * Mock backend for the end-to-end tests and the screenshots. It plays the part of
 * the real trade-capture service's edge, with the same wire contract (v2):
 *
 * - static files of the built Angular app;
 * - WebSocket feeds /ws/quotes and /ws/trades: snapshot first, then sequenced
 *   deltas, a heartbeat every second, and {"type":"resync"} answered with a
 *   fresh snapshot (this mirrors LiveFeedHub / FeedSocketHandler on the server);
 * - REST: POST/GET /api/notes, GET /api/notes/:id/terms, GET /api/system/status,
 *   with the same validation rules and 422 problem format as NoteTerms;
 * - /__control/*: the surface tests use to script the feed.
 */
import {createReadStream, existsSync, statSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

import {WebSocketServer} from 'ws';

const PORT = Number(process.env.PORT ?? 4300);
const ROOT = join(
  fileURLToPath(new URL('..', import.meta.url)),
  'dist/blotter/browser'
);
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};
const TAPE_MAX = 500;

const DEFAULT_SYMBOLS = [
  ['AAPL', 187.25],
  ['AMZN', 178.1],
  ['GOOG', 141.8],
  ['META', 480.2],
  ['MSFT', 410.5],
  ['NFLX', 610.0],
  ['NVDA', 120.4],
  ['TSLA', 250.9],
];

/** A larger named universe (28 names) used for screenshots and demos. */
const BIG_SYMBOLS = [
  ...DEFAULT_SYMBOLS,
  ['AMD', 162.4],
  ['AVGO', 168.2],
  ['BAC', 41.3],
  ['BRK.B', 452.6],
  ['COST', 880.1],
  ['CRM', 262.7],
  ['DIS', 112.4],
  ['GS', 489.9],
  ['INTC', 30.8],
  ['JNJ', 154.2],
  ['JPM', 201.5],
  ['KO', 62.3],
  ['LLY', 790.5],
  ['MA', 468.8],
  ['ORCL', 125.6],
  ['PEP', 168.9],
  ['UNH', 521.4],
  ['V', 279.3],
  ['WMT', 67.1],
  ['XOM', 118.7],
];

/** Deterministic PRNG (mulberry32) so screenshots and live mode are repeatable. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mutable server state, replaced by /__control/reset. */
const state = {
  quoteSeq: 0,
  tradeSeq: 0,
  quotes: new Map(),
  volume: new Map(),
  tape: [],
  mids: new Map(),
  connections: {quotes: 0, trades: 0},
  resyncRequests: {quotes: 0, trades: 0},
  bookings: [],
  notes: [],
  heartbeats: true,
  rand: prng(42),
  clockSkew: 0,
  live: null,
};

/**
 * Applies a captured trade to both feeds, exactly like LiveBoard.onTrade.
 *
 * @param {{sym:string, side:string, qty:number, pxMicros:number, account?:string, id?:string, ts?:number}} t
 * @return {{quote: object, trade: object}} The stamped rows.
 */
function onTrade(t) {
  state.tradeSeq += 1;
  const trade = {
    id: t.id ?? `MOCK/T${state.tradeSeq}`,
    source: 'MOCK',
    account: t.account ?? 'ACC7',
    sym: t.sym,
    side: t.side,
    qty: t.qty,
    pxMicros: t.pxMicros,
    seq: state.tradeSeq,
    ts: t.ts ?? Date.now(),
  };
  state.tape.unshift(trade);
  state.tape.length = Math.min(state.tape.length, TAPE_MAX);
  state.quoteSeq += 1;
  const volume = (state.volume.get(t.sym) ?? 0) + t.qty;
  state.volume.set(t.sym, volume);
  const quote = {
    sym: t.sym,
    px: t.pxMicros / 1e6,
    qty: volume,
    seq: state.quoteSeq,
    ts: trade.ts,
  };
  state.quotes.set(t.sym, quote);
  return {quote, trade};
}

/**
 * Resets the feed to a known set of symbols, each with one seed trade.
 *
 * @param {number} count How many symbols; 8 uses the named defaults.
 */
function reset(count) {
  stopLive();
  Object.assign(state, {
    quoteSeq: 0,
    tradeSeq: 0,
    quotes: new Map(),
    volume: new Map(),
    tape: [],
    mids: new Map(),
    connections: {quotes: 0, trades: 0},
    resyncRequests: {quotes: 0, trades: 0},
    bookings: [],
    notes: [],
    heartbeats: true,
    rand: prng(42),
  });
  const universe =
    count === 8
      ? DEFAULT_SYMBOLS
      : count === 28
        ? BIG_SYMBOLS
        : Array.from({length: count}, (_, i) => [
            'SYM' + String(i + 1).padStart(4, '0'),
            1 + ((i + 1) % 97),
          ]);
  for (const [sym, px] of universe) {
    state.mids.set(sym, px);
    onTrade({
      sym,
      side: 'BUY',
      qty: 1000,
      pxMicros: Math.round(px * 1e6),
      id: `SEED/${sym}`,
      ts: Date.now() - 60_000,
    });
  }
}

/** @return {string} The quote board as a snapshot message. */
function quoteSnapshot() {
  return JSON.stringify({
    kind: 'snapshot',
    seq: state.quoteSeq,
    quotes: [...state.quotes.values()].sort((a, b) =>
      a.sym.localeCompare(b.sym)
    ),
  });
}

/** @return {string} The tape as a snapshot message. */
function tradeSnapshot() {
  return JSON.stringify({
    kind: 'snapshot',
    seq: state.tradeSeq,
    trades: state.tape,
  });
}

/**
 * Port of NoteTerms.parse validation: every failing rule is reported.
 *
 * @param {any} body The request body.
 * @return {{field:string, message:string}[]} The errors, empty when valid.
 */
function validate(body) {
  const errors = [];
  const add = (field, message) => errors.push({field, message});
  const places = (v, dp) =>
    Math.abs(v * 10 ** dp - Math.round(v * 10 ** dp)) < 1e-6;
  if (
    typeof body.underlying !== 'string' ||
    !/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(body.underlying)
  ) {
    add('underlying', 'underlying must be 1-12 chars of A-Z 0-9 . -');
  }
  const n = body.notional;
  if (typeof n !== 'number' || n <= 0)
    add('notional', 'notional must be positive');
  else if (n > 1e9)
    add('notional', 'notional exceeds the hard limit of 1,000,000,000');
  else if (!places(n, 2))
    add('notional', 'notional allows at most 2 decimal places');
  const r = body.couponRate;
  if (typeof r !== 'number' || r < 0 || r > 1)
    add('couponRate', 'couponRate must be a fraction between 0 and 1');
  else if (!places(r, 4))
    add('couponRate', 'couponRate allows at most 4 decimal places');
  const barrier = field => {
    const v = body[field];
    if (typeof v !== 'number' || v <= 0 || v > 200) {
      add(field, `${field} must be above 0 and at most 200 percent`);
      return false;
    }
    if (!places(v, 2)) {
      add(field, `${field} allows at most 2 decimal places`);
      return false;
    }
    return true;
  };
  const okC = barrier('couponBarrier');
  const okA = barrier('autocallBarrier');
  const okK = barrier('kiBarrier');
  if (!errors.length && okC && okA && okK) {
    if (!(body.kiBarrier < body.couponBarrier))
      add('kiBarrier', 'KI barrier must be below the coupon barrier');
    if (body.couponBarrier > body.autocallBarrier)
      add('couponBarrier', 'Coupon barrier cannot exceed autocall barrier');
  }
  return errors;
}

/**
 * Reads a JSON request body.
 *
 * @param {import('node:http').IncomingMessage} req The request.
 * @return {Promise<any>} The parsed body, or an empty object.
 */
async function body(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : {};
}

/** Starts the random-walk trade generator ("LIVE" mode for screenshots/demos). */
function startLive(intervalMs) {
  stopLive();
  state.live = setInterval(() => {
    const syms = [...state.mids.keys()];
    if (!syms.length) return;
    const sym = syms[Math.floor(state.rand() * syms.length)];
    const mid = state.mids.get(sym);
    const next = Math.max(0.5, mid * (1 + (state.rand() - 0.5) * 0.002));
    state.mids.set(sym, next);
    const {quote, trade} = onTrade({
      sym,
      side: state.rand() < 0.5 ? 'BUY' : 'SELL',
      qty: 100 * (1 + Math.floor(state.rand() * 40)),
      pxMicros: Math.round(next * 1e6),
      account: ['ACC7', 'ACC9', 'DESK-A', 'DESK-B'][
        Math.floor(state.rand() * 4)
      ],
    });
    broadcast('quotes', {kind: 'delta', seq: quote.seq, quote});
    broadcast('trades', {kind: 'delta', seq: trade.seq, trade});
  }, intervalMs);
}

function stopLive() {
  if (state.live) {
    clearInterval(state.live);
    state.live = null;
  }
}

reset(8);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const json = (status, value, extra = {}) => {
    res.writeHead(status, {'content-type': 'application/json', ...extra});
    res.end(JSON.stringify(value));
  };
  const post = req.method === 'POST';

  // ---- control surface (tests only) ---------------------------------------
  if (url.pathname === '/__control/stats') {
    return json(200, {
      connections: state.connections,
      resyncRequests: state.resyncRequests,
      bookings: state.bookings,
      quoteSeq: state.quoteSeq,
      tradeSeq: state.tradeSeq,
    });
  }
  if (url.pathname === '/__control/reset' && post) {
    reset((await body(req)).symbols ?? 8);
    return json(200, {ok: true});
  }
  if (url.pathname === '/__control/trade' && post) {
    const {sym, side = 'BUY', qty = 100, px, account} = await body(req);
    const {quote, trade} = onTrade({
      sym,
      side,
      qty,
      pxMicros: Math.round(px * 1e6),
      account,
    });
    broadcast('quotes', {kind: 'delta', seq: quote.seq, quote});
    broadcast('trades', {kind: 'delta', seq: trade.seq, trade});
    return json(200, {quoteSeq: quote.seq, tradeSeq: trade.seq});
  }
  if (url.pathname === '/__control/gap' && post) {
    // Skip three sequence numbers on one feed, then publish: the client sees a gap.
    const {sym, px, feed = 'quotes'} = await body(req);
    if (feed === 'quotes') state.quoteSeq += 3;
    else state.tradeSeq += 3;
    const {quote, trade} = onTrade({
      sym,
      side: 'BUY',
      qty: 100,
      pxMicros: Math.round(px * 1e6),
    });
    if (feed === 'quotes')
      broadcast('quotes', {kind: 'delta', seq: quote.seq, quote});
    else broadcast('trades', {kind: 'delta', seq: trade.seq, trade});
    return json(200, {ok: true});
  }
  if (url.pathname === '/__control/drop' && post) {
    for (const client of wss.clients) client.terminate();
    return json(200, {ok: true});
  }
  if (url.pathname === '/__control/close' && post) {
    for (const client of wss.clients) client.close(1000, 'normal closure');
    return json(200, {ok: true});
  }
  if (url.pathname === '/__control/heartbeats' && post) {
    state.heartbeats = (await body(req)).on !== false;
    return json(200, {ok: true});
  }
  if (url.pathname === '/__control/live' && post) {
    const {on = true, intervalMs = 120} = await body(req);
    if (on) startLive(intervalMs);
    else stopLive();
    return json(200, {ok: true});
  }

  // ---- REST: same contract as the Spring controllers ------------------------
  if (url.pathname === '/api/system/status') {
    return json(200, {
      service: 'trade-capture-mock',
      serverTime: new Date(Date.now() + state.clockSkew).toISOString(),
      quoteSeq: state.quoteSeq,
      tradeSeq: state.tradeSeq,
      quoteClients: state.connections.quotes,
      tradeClients: state.connections.trades,
      inserted: state.tradeSeq,
      duplicates: 0,
      demo: true,
    });
  }
  if (url.pathname === '/api/notes' && post) {
    const terms = await body(req);
    const errors = validate(terms);
    const correlationId = req.headers['x-correlation-id'];
    if (errors.length) {
      return json(
        422,
        {
          title: 'Unprocessable Content',
          status: 422,
          detail: 'Validation failed',
          errors,
        },
        {'x-correlation-id': correlationId ?? ''}
      );
    }
    const id = 'N-' + (1000 + state.notes.length + 1);
    state.bookings.push({terms, correlationId});
    state.notes.unshift({id, bookedAt: new Date().toISOString(), terms});
    return json(
      201,
      {id},
      {
        location: `/api/notes/${id}/terms`,
        'x-correlation-id': correlationId ?? '',
      }
    );
  }
  if (url.pathname === '/api/notes') {
    return json(
      200,
      state.notes.slice(0, Number(url.searchParams.get('limit') ?? 50))
    );
  }
  const termsMatch = url.pathname.match(/^\/api\/notes\/([^/]+)\/terms$/);
  if (termsMatch) {
    const note = state.notes.find(
      n => n.id === decodeURIComponent(termsMatch[1])
    );
    return note ? json(200, note.terms) : json(404, {status: 404});
  }

  // ---- static files ----------------------------------------------------------
  const relative = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, relative === '/' ? 'index.html' : relative);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(ROOT, 'index.html');
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({noServer: true});
const feeds = {quotes: new Set(), trades: new Set()};

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const feed =
    path === '/ws/quotes' ? 'quotes' : path === '/ws/trades' ? 'trades' : null;
  if (!feed) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => {
    state.connections[feed] += 1;
    feeds[feed].add(ws);
    ws.on('close', () => feeds[feed].delete(ws));
    ws.send(feed === 'quotes' ? quoteSnapshot() : tradeSnapshot());
    ws.on('message', raw => {
      if (JSON.parse(raw.toString()).type === 'resync') {
        state.resyncRequests[feed] += 1;
        ws.send(feed === 'quotes' ? quoteSnapshot() : tradeSnapshot());
      }
    });
  });
});

/**
 * Sends a message to every client of one feed.
 *
 * @param {'quotes'|'trades'} feed The feed.
 * @param {object} message The message, serialised here.
 */
function broadcast(feed, message) {
  const text = JSON.stringify(message);
  for (const client of feeds[feed]) {
    if (client.readyState === 1) client.send(text);
  }
}

setInterval(() => {
  if (!state.heartbeats) return;
  broadcast('quotes', {kind: 'heartbeat', seq: state.quoteSeq});
  broadcast('trades', {kind: 'heartbeat', seq: state.tradeSeq});
}, 1000);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock backend on http://127.0.0.1:${PORT}`);
});
