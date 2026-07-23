import assert from "node:assert/strict";
import test from "node:test";
import { PriorityGenerationQueue } from "../server/generation-queue.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("VIP jobs move ahead of free jobs that are waiting", async () => {
  const queue = new PriorityGenerationQueue(1);
  const blocker = deferred();
  const started = deferred();
  const order: string[] = [];

  const first = queue.enqueue({ id: "running", tier: "vip", task: async () => {
    order.push("running");
    started.resolve();
    await blocker.promise;
    return "running";
  } });
  await started.promise;

  const free = queue.enqueue({ id: "free", tier: "free", task: async () => { order.push("free"); return "free"; } });
  const vip = queue.enqueue({ id: "vip", tier: "vip", task: async () => { order.push("vip"); return "vip"; } });
  blocker.resolve();

  assert.deepEqual(await Promise.all([first, free, vip]), ["running", "free", "vip"]);
  assert.deepEqual(order, ["running", "vip", "free"]);
});

test("VIP jobs bypass the configured free-queue delay", async () => {
  const queue = new PriorityGenerationQueue(1);
  const order: string[] = [];
  const free = queue.enqueue({ id: "delayed-free", tier: "free", delayMs: 30, task: async () => { order.push("free"); } });
  const vip = queue.enqueue({ id: "ready-vip", tier: "vip", task: async () => { order.push("vip"); } });
  await Promise.all([free, vip]);
  assert.deepEqual(order, ["vip", "free"]);
});
