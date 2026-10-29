export type Role = "api" | "inbox" | "reminders";
const defaults: Record<Role, number> = { api: 30000, inbox: 120000, reminders: 30000 };

export function shutdownPolicy(role: Role, env: NodeJS.ProcessEnv = process.env) {
  const timeoutMs = Number(env.SHUTDOWN_TIMEOUT_MS ?? defaults[role]);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000)
    throw new Error("shutdown_timeout_invalid");
  const railway = Boolean(env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID);
  const advertised = env.RAILWAY_DEPLOYMENT_DRAINING_SECONDS;
  if (railway || advertised !== undefined) {
    const seconds = Number(advertised);
    if (!advertised || !Number.isSafeInteger(seconds) || seconds <= 0 || seconds * 1000 < timeoutMs + 5000)
      throw new Error("railway_shutdown_budget_unverified");
  }
  // This validates the advertised budget only. SIGKILL/platform configuration
  // cannot be enforced by application code; interruption recovery is mandatory.
  return { timeoutMs, advertisedSeconds: advertised ? Number(advertised) : null };
}

export class WorkGroup {
  private pending = new Set<Promise<unknown>>();
  private idle = new Set<() => void>();
  get size() { return this.pending.size; }
  run<T>(work: () => Promise<T> | T): Promise<T> {
    const promise = Promise.resolve().then(work);
    this.pending.add(promise);
    const done = () => {
      this.pending.delete(promise);
      if (!this.pending.size) { for (const wake of this.idle) wake(); this.idle.clear(); }
    };
    promise.then(done, done);
    return promise;
  }
  waitForIdle(): Promise<void> {
    return this.pending.size ? new Promise(resolve => this.idle.add(resolve)) : Promise.resolve();
  }
}

type Options = { env?: NodeJS.ProcessEnv; exit?: (code: number) => void; log?: (event: object) => void; signals?: boolean };
export class Lifecycle {
  readonly policy;
  readonly signal: AbortSignal;
  private aborter = new AbortController();
  private work = new WorkGroup();
  private drainers: (() => Promise<unknown> | unknown)[] = [];
  private closers: (() => Promise<unknown> | unknown)[] = [];
  private shutdown?: Promise<void>;
  private failed = false;
  private exiting = false;
  private exit: (code: number) => void;
  private log: (event: object) => void;
  private termHandler = () => { void this.stop("SIGTERM"); };
  private intHandler = () => { void this.stop("SIGINT"); };
  constructor(readonly role: Role, options: Options = {}) {
    this.policy = shutdownPolicy(role, options.env);
    this.signal = this.aborter.signal;
    this.exit = options.exit ?? (code => process.exit(code));
    this.log = options.log ?? (event => console.log(JSON.stringify(event)));
    if (options.signals !== false) { process.on("SIGTERM", this.termHandler); process.on("SIGINT", this.intHandler); }
  }
  get stopping() { return this.signal.aborted; }
  onDrain(action: () => Promise<unknown> | unknown) {
    if (this.stopping) this.invokeDrain(action); else this.drainers.push(action);
  }
  onClose(action: () => Promise<unknown> | unknown) { this.closers.push(action); }
  private invokeDrain(action: () => Promise<unknown> | unknown) {
    void this.work.run(action).catch(() => { this.failed = true; });
  }
  run(main: () => Promise<unknown>) {
    void this.work.run(main).catch(() => { this.failed = true; void this.stop("main_failed"); });
  }
  fail(reason: string) { this.failed = true; void this.stop(reason); }
  wait(ms: number): Promise<void> {
    if (this.stopping) return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => { clearTimeout(timer); this.signal.removeEventListener("abort", finish); resolve(); };
      const timer = setTimeout(finish, ms);
      this.signal.addEventListener("abort", finish, { once: true });
    });
  }
  stop(reason: string): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.aborter.abort();
    this.log({ event: "shutdown_started", role: this.role, reason, timeoutMs: this.policy.timeoutMs });
    const timer = setTimeout(() => {
      if (this.exiting) return;
      this.exiting = true;
      this.log({ event: "shutdown_forced", role: this.role, clean: false });
      this.exit(1);
    }, this.policy.timeoutMs); // Keep alive: an unresolved promise is not a clean exit.
    for (const action of this.drainers.splice(0)) this.invokeDrain(action);
    this.shutdown = (async () => {
      await this.work.waitForIdle();
      if (this.exiting) return;
      for (const close of this.closers.reverse()) {
        try { await close(); } catch { this.failed = true; }
      }
      if (this.exiting) return;
      clearTimeout(timer); this.exiting = true;
      process.removeListener("SIGTERM", this.termHandler); process.removeListener("SIGINT", this.intHandler);
      this.log({ event: "shutdown_complete", role: this.role, clean: !this.failed });
      this.exit(this.failed ? 1 : 0);
    })();
    return this.shutdown;
  }
}
