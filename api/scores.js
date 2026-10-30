// Shared leaderboards: the top 10 game scores and the top 5 of every event, kept as Redis sorted sets in an
// Upstash Redis database. Connecting the database to the Vercel project sets KV_REST_API_URL and
// KV_REST_API_TOKEN (or the UPSTASH_REDIS_REST_* names); the service talks to its REST API with fetch.
// GET returns both boards. POST adds one result, if it makes the board, and returns the boards and its rank.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PREFIX = 'sa83:';
// Lowest time wins for the races; otherwise the longest or highest mark wins. Ranges reject impossible marks.
const EVENTS = {
  dash: { time: true, min: 8.5, max: 60 },
  long: { time: false, min: 0.01, max: 9.9 },
  jav: { time: false, min: 0.01, max: 110 },
  hurdles: { time: true, min: 10.5, max: 90 },
  hammer: { time: false, min: 0.01, max: 95 },
  high: { time: false, min: 0.5, max: 2.6 },
};
const BOARD_SIZE = 10, EVENT_SIZE = 5;
const NAME = /^[A-Z. -]{3}$/, NATION = /^[A-Z]{3}$/;
// Each address may post RATE_LIMIT results per RATE_WINDOW seconds, the same limit the other games use.
const RATE_LIMIT = 10, RATE_WINDOW = 600;

// One sorted set per list. Each member is "<order key>|<row JSON>": the order key makes an earlier
// result rank ahead of a later one with the same mark (Redis orders equal scores by member).
const LISTS = [{ key: 'board', size: BOARD_SIZE, asc: false }]
  .concat(Object.keys(EVENTS).map(id => ({ key: 'event:' + id, id, size: EVENT_SIZE, asc: EVENTS[id].time })));
const orderKey = (asc, t) => String(asc ? t : 1e13 - t).padStart(13, '0');
const rangeCmd = (l) => ['ZRANGE', PREFIX + l.key, 0, l.size - 1].concat(l.asc ? [] : ['REV']);
const rows = (members) => (members || []).map(m => JSON.parse(m.slice(m.indexOf('|') + 1)));

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Runs commands through the REST API: 'pipeline' for reads, 'multi-exec' for an atomic transaction.
async function redis(path, commands) {
  const res = await fetch(URL_ + '/' + path, {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error('redis ' + res.status);
  const out = await res.json();
  return out.map(r => { if (r.error) throw new Error(r.error); return r.result; });
}

// Turns the ZRANGE results (in LISTS order) into { board, events }.
function boards(results) {
  const data = { board: rows(results[0]), events: {} };
  LISTS.slice(1).forEach((l, i) => { data.events[l.id] = rows(results[i + 1]); });
  return data;
}

// Checks a posted result and returns [list, score, row] or a string saying what is wrong.
function parse(b) {
  if (!b || typeof b !== 'object') return 'bad body';
  if (!NAME.test(b.n || '')) return 'bad name';
  if (!NATION.test(b.c || '')) return 'bad nation';
  const t = Date.now();
  if (b.kind === 'board') {
    const s = b.s, r = b.r;
    if (!Number.isInteger(s) || s < 1 || s > 50000) return 'bad score';
    if (!Number.isInteger(r) || r < 1 || r > 50) return 'bad round';
    return [LISTS[0], s, { n: b.n, s, c: b.c, r, t }];
  }
  if (b.kind === 'event') {
    const ev = EVENTS[b.id], v = b.v;
    if (!ev) return 'bad event';
    if (typeof v !== 'number' || !Number.isFinite(v) || v < ev.min || v > ev.max) return 'bad mark';
    const mark = Math.round(v * 100) / 100;
    return [LISTS.find(l => l.id === b.id), mark, { n: b.n, v: mark, c: b.c, t }];
  }
  return 'bad kind';
}

export async function GET() {
  if (!URL_ || !TOKEN) return json({ error: 'no database' }, 503);
  try {
    return json(boards(await redis('pipeline', LISTS.map(rangeCmd))));
  } catch (e) {
    return json({ error: 'unavailable' }, 503);
  }
}

export async function POST(request) {
  if (!URL_ || !TOKEN) return json({ error: 'no database' }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const p = parse(body);
  if (typeof p === 'string') return json({ error: p }, 400);
  const [list, score, row] = p;
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  try {
    const rl = PREFIX + 'rl:' + ip;
    const [, count] = await redis('pipeline', [['SET', rl, '0', 'EX', RATE_WINDOW, 'NX'], ['INCR', rl]]);
    if (count > RATE_LIMIT) return json({ error: 'too many' }, 429);
  } catch (e) {
    return json({ error: 'unavailable' }, 503);
  }
  const key = PREFIX + list.key, member = orderKey(list.asc, row.t) + '|' + JSON.stringify(row);
  // Add, drop whatever falls off the end, then read the new entry's place and every list, all in one transaction.
  const trim = list.asc ? ['ZREMRANGEBYRANK', key, list.size, -1] : ['ZREMRANGEBYRANK', key, 0, -(list.size + 1)];
  try {
    const out = await redis('multi-exec', [
      ['ZADD', key, score, member], trim, [list.asc ? 'ZRANK' : 'ZREVRANK', key, member],
    ].concat(LISTS.map(rangeCmd)));
    const rank = out[2] === null || out[2] === undefined ? -1 : out[2];
    return json(Object.assign(boards(out.slice(3)), { rank }));
  } catch (e) {
    return json({ error: 'unavailable' }, 503);
  }
}
