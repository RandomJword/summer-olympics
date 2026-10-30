// Shared leaderboards: the top 10 game scores and the top 5 of every event, kept as Redis sorted sets in an
// Upstash Redis database. Connecting the database to the Vercel project sets KV_REST_API_URL and
// KV_REST_API_TOKEN (or the UPSTASH_REDIS_REST_* names); the service talks to its REST API with fetch.
// GET returns both boards. POST adds one result, if it makes the board, and returns the boards and its rank.
// One set of initials holds at most PER_PLAYER places on any list; a better result pushes out their worst one.

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
const BOARD_SIZE = 10, EVENT_SIZE = 5, PER_PLAYER = 3;
const NAME = /^[A-Z. -]{3}$/, NATION = /^[A-Z]{3}$/;
// Each address may post RATE_LIMIT results per RATE_WINDOW seconds, the same limit the other games use.
const RATE_LIMIT = 10, RATE_WINDOW = 600;

// One sorted set per list. Each member is "<order key>|<row JSON>": the order key makes an earlier
// result rank ahead of a later one with the same mark (Redis orders equal scores by member).
const LISTS = [{ key: 'board', size: BOARD_SIZE, asc: false }]
  .concat(Object.keys(EVENTS).map(id => ({ key: 'event:' + id, id, size: EVENT_SIZE, asc: EVENTS[id].time })));
const orderKey = (asc, t) => String(asc ? t : 1e13 - t).padStart(13, '0');
const rangeCmd = (l) => ['ZRANGE', PREFIX + l.key, 0, l.size - 1].concat(l.asc ? [] : ['REV']);
// Adds a member, then drops the same player's places past PER_PLAYER and whatever falls off the end,
// and returns the new member's rank (nil if it did not stay). KEYS[1] = list; ARGV = score, member,
// '"n":"<name>"' tag, list size, 1 if lowest first, PER_PLAYER.
const ADD = `
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
local asc = ARGV[5] == '1'
local all = asc and redis.call('ZRANGE', KEYS[1], 0, -1) or redis.call('ZRANGE', KEYS[1], 0, -1, 'REV')
local seen = 0
for _, m in ipairs(all) do
  if string.find(m, ARGV[3], 1, true) then
    seen = seen + 1
    if seen > tonumber(ARGV[6]) then redis.call('ZREM', KEYS[1], m) end
  end
end
local size = tonumber(ARGV[4])
if asc then redis.call('ZREMRANGEBYRANK', KEYS[1], size, -1) else redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -(size + 1)) end
if asc then return redis.call('ZRANK', KEYS[1], ARGV[2]) end
return redis.call('ZREVRANK', KEYS[1], ARGV[2])`;
// One-time wipe of every list (JD's second reset of 30 Oct 2026; bump the key to wipe again): the first request after the deploy clears them.
const RESET = ['EVAL', "if redis.call('SET', KEYS[1], '1', 'NX') then redis.call('DEL', unpack(ARGV)) end return 1",
  1, PREFIX + 'reset:2026-10-30b'].concat(LISTS.map(l => PREFIX + l.key));
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
    return json(boards((await redis('pipeline', [RESET].concat(LISTS.map(rangeCmd)))).slice(1)));
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
    const [, , count] = await redis('pipeline', [RESET, ['SET', rl, '0', 'EX', RATE_WINDOW, 'NX'], ['INCR', rl]]);
    if (count > RATE_LIMIT) return json({ error: 'too many' }, 429);
  } catch (e) {
    return json({ error: 'unavailable' }, 503);
  }
  const key = PREFIX + list.key, member = orderKey(list.asc, row.t) + '|' + JSON.stringify(row);
  const tag = '"n":' + JSON.stringify(row.n);
  // The add runs as one script, so two posts at once cannot leave a player with too many places.
  try {
    const out = await redis('pipeline', [
      ['EVAL', ADD, 1, key, score, member, tag, list.size, list.asc ? 1 : 0, PER_PLAYER],
    ].concat(LISTS.map(rangeCmd)));
    const rank = out[0] === null || out[0] === undefined ? -1 : out[0];
    return json(Object.assign(boards(out.slice(1)), { rank }));
  } catch (e) {
    return json({ error: 'unavailable' }, 503);
  }
}
