// Shared leaderboards: the top 10 game scores and the top 5 of every event, kept as one JSON file in a
// private Vercel Blob store (BLOB_READ_WRITE_TOKEN is set on the project by the store connection).
// GET returns both boards. POST adds one result, if it makes the board, and returns the boards and its rank.
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const PATH = 'leaderboards.json';
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

const empty = () => ({ board: [], events: Object.fromEntries(Object.keys(EVENTS).map(id => [id, []])) });
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function load() {
  const res = await get(PATH, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return { data: empty(), etag: null };
  const data = Object.assign(empty(), await new Response(res.stream).json());
  for (const id of Object.keys(EVENTS)) if (!Array.isArray(data.events[id])) data.events[id] = [];
  return { data, etag: res.blob.etag };
}

// Checks a posted result and returns [list key, row, better(a, b)] or a string saying what is wrong.
function parse(b) {
  if (!b || typeof b !== 'object') return 'bad body';
  if (!NAME.test(b.n || '')) return 'bad name';
  if (!NATION.test(b.c || '')) return 'bad nation';
  if (b.kind === 'board') {
    const s = b.s, r = b.r;
    if (!Number.isInteger(s) || s < 1 || s > 50000) return 'bad score';
    if (!Number.isInteger(r) || r < 1 || r > 50) return 'bad round';
    return [null, { n: b.n, s, c: b.c, r, t: Date.now() }, (x, y) => x.s > y.s];
  }
  if (b.kind === 'event') {
    const ev = EVENTS[b.id], v = b.v;
    if (!ev) return 'bad event';
    if (typeof v !== 'number' || !Number.isFinite(v) || v < ev.min || v > ev.max) return 'bad mark';
    return [b.id, { n: b.n, v: Math.round(v * 100) / 100, c: b.c, t: Date.now() }, ev.time ? (x, y) => x.v < y.v : (x, y) => x.v > y.v];
  }
  return 'bad kind';
}

export async function GET() {
  try {
    const { data } = await load();
    return json(data);
  } catch (e) {
    return json({ error: 'unavailable' }, 503);
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const p = parse(body);
  if (typeof p === 'string') return json({ error: p }, 400);
  const [id, row, better] = p;
  // Read, insert and write with the ETag, retrying if another player saved in between.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { data, etag } = await load();
      const list = id ? data.events[id] : data.board;
      const size = id ? EVENT_SIZE : BOARD_SIZE;
      let rank = 0;
      while (rank < list.length && !better(row, list[rank])) rank++;
      if (rank >= size) return json(Object.assign(data, { rank: -1 }));
      list.splice(rank, 0, row);
      list.length = Math.min(list.length, size);
      await put(PATH, JSON.stringify(data), {
        access: 'private', contentType: 'application/json', addRandomSuffix: false,
        allowOverwrite: !!etag, ...(etag ? { ifMatch: etag } : {}),
      });
      return json(Object.assign(data, { rank }));
    } catch (e) {
      if (!(e instanceof BlobPreconditionFailedError) && !/exists/i.test(String(e && e.message))) return json({ error: 'unavailable' }, 503);
    }
  }
  return json({ error: 'busy' }, 503);
}
