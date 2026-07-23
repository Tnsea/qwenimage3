export type GenerationQueueTier = "free" | "vip";

interface QueueJob<T> {
  id: string;
  tier: GenerationQueueTier;
  sequence: number;
  readyAt: number;
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export interface QueueJobOptions<T> {
  id: string;
  tier: GenerationQueueTier;
  delayMs?: number;
  task: () => Promise<T>;
}

export class PriorityGenerationQueue {
  private readonly concurrency: number;
  private active = 0;
  private sequence = 0;
  private pending: Array<QueueJob<unknown>> = [];
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(concurrency = 1) {
    this.concurrency = Math.max(1, Math.floor(concurrency));
  }

  enqueue<T>({ id, tier, delayMs = 0, task }: QueueJobOptions<T>) {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        id,
        tier,
        sequence: this.sequence++,
        readyAt: Date.now() + Math.max(0, delayMs),
        task,
        resolve,
        reject,
      } as QueueJob<unknown>);
      this.schedule();
    });
  }

  snapshot(id: string) {
    const ordered = [...this.pending].sort((left, right) => this.compare(left, right));
    const index = ordered.findIndex((job) => job.id === id);
    return index < 0 ? null : { position: index + 1, tier: ordered[index].tier };
  }

  private compare(left: QueueJob<unknown>, right: QueueJob<unknown>) {
    const priorityDifference = Number(right.tier === "vip") - Number(left.tier === "vip");
    return priorityDifference || left.sequence - right.sequence;
  }

  private schedule() {
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }

    while (this.active < this.concurrency && this.pending.length > 0) {
      this.pending.sort((left, right) => this.compare(left, right));
      const now = Date.now();
      const readyIndex = this.pending.findIndex((job) => job.readyAt <= now);
      if (readyIndex < 0) {
        const waitMs = Math.max(1, Math.min(...this.pending.map((job) => job.readyAt)) - now);
        this.wakeTimer = setTimeout(() => this.schedule(), waitMs);
        return;
      }

      const [job] = this.pending.splice(readyIndex, 1);
      this.active += 1;
      void job.task().then(job.resolve, job.reject).finally(() => {
        this.active -= 1;
        this.schedule();
      });
    }
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const generationQueue = new PriorityGenerationQueue(positiveInteger(process.env.GENERATION_CONCURRENCY, 1));

export function freeQueueDelayMs() {
  const parsed = Number(process.env.FREE_QUEUE_DELAY_MS ?? 1500);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1500;
}
