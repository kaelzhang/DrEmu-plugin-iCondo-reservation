import assert from "node:assert/strict";
import test from "node:test";
import { clock, createLogger } from "../plugin/core/logger.js";

test("log times are 24-hour HH:MM:SS, composed without toLocaleTimeString", () => {
  assert.equal(clock(new Date(2026, 9, 1, 21, 5, 9).getTime()), "21:05:09");
  assert.equal(clock(new Date(2026, 9, 1, 0, 0, 0).getTime()), "00:00:00");
});

test("the logger keeps the last `keep` lines and numbers every line", () => {
  const seen = [];
  const logger = createLogger({ keep: 2, now: () => new Date(2026, 9, 1, 9, 0, 0).getTime(), onAppend: (line) => seen.push(line.seq) });
  logger.info("a");
  logger.warn("b", { n: 1 });
  logger.error("c");
  assert.deepEqual(logger.lines().map((line) => [line.seq, line.at, line.level, line.text]), [[2, "09:00:00", "warn", "b n=1"], [3, "09:00:00", "error", "c"]]);
  assert.deepEqual(seen, [1, 2, 3]);
});
