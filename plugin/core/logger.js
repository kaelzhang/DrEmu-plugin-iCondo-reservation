// The run's log as the panel shows it: the last `keep` lines, each numbered
// by `seq` — a number no other line of this run ever carries, which the
// panel uses as the line's key. `onAppend(line)` is told of every new line,
// so the control script publishes that one line, never the whole log.
export const LEVELS = Object.freeze(["debug", "info", "warn", "error"]);

const clock = (at) => new Date(at).toLocaleTimeString("en-GB", { hour12: false });

function describe(event, fields) {
  const detail = Object.entries(fields ?? {})
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
  return detail ? `${event} ${detail}` : event;
}

export function createLogger({ keep = 500, now = Date.now, onAppend = () => {} } = {}) {
  let lines = [];
  let seq = 0;
  function write(level, event, fields) {
    seq += 1;
    const line = Object.freeze({ seq, at: clock(now()), level, text: describe(event, fields) });
    lines.push(line);
    if (lines.length > keep) lines = lines.slice(lines.length - keep);
    onAppend(line);
    return line;
  }
  const logger = { keep, lines: () => [...lines], clear: () => { lines = []; } };
  for (const level of LEVELS) logger[level] = (event, fields) => write(level, event, fields);
  return Object.freeze(logger);
}
