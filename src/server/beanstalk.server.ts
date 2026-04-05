import { Logger, LoggerService } from '@nestjs/common';
import { CustomTransportStrategy, Server } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { client as FivebeansClient } from 'fivebeans';
import { BeanstalkContext } from '../context/beanstalk.context';
import { BeanstalkMessage, BeanstalkServerOptions } from '../interfaces';

const DEFAULTS = {
  host: 'localhost',
  port: 11300,
  tube: 'default',
  concurrency: 1,
  autoAck: true,
  maxRetries: 3,
  retryDelay: 5,
  retryPriority: 0,
  ttr: 60,
  reconnectDelay: 3000,
  logger: true,
} satisfies Required<BeanstalkServerOptions>;

/** Timeout used per reserve_with_timeout call (seconds). */
const RESERVE_TIMEOUT_SECS = 2;

/** No-op logger used when logger: false */
const NOOP: LoggerService = {
  log: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  verbose: () => {},
  fatal: () => {},
};

/**
 * NestJS custom transport strategy for Beanstalkd.
 *
 * @example
 * ```ts
 * const app = await NestFactory.createMicroservice(AppModule, {
 *   strategy: new BeanstalkServer({ host: 'localhost', tube: 'orders' }),
 * });
 * ```
 */
export class BeanstalkServer
  extends Server
  implements CustomTransportStrategy
{
  private readonly opts: Required<BeanstalkServerOptions>;
  private readonly _logger: LoggerService;
  private workerClients: FivebeansClient[] = [];
  private workers: Promise<void>[] = [];
  private running = false;

  constructor(options: BeanstalkServerOptions = {}) {
    super();
    this.opts = { ...DEFAULTS, ...options };

    const logOpt = this.opts.logger;
    if (logOpt === false) {
      this._logger = NOOP;
    } else if (logOpt === true) {
      this._logger = new Logger(BeanstalkServer.name);
    } else {
      this._logger = logOpt as LoggerService;
    }
  }

  // ─── CustomTransportStrategy ──────────────────────────────────────────────

  async listen(callback: (...args: unknown[]) => void): Promise<void> {
    try {
      this.running = true;
      await this.spawnWorkers();
      this._logger.log(
        `Listening on ${this.opts.host}:${this.opts.port} ` +
          `tube="${this.opts.tube}" concurrency=${this.opts.concurrency}`,
      );
      callback();
    } catch (err) {
      this._logger.error(`Failed to start: ${err}`);
      callback(err);
    }
  }

  async close(): Promise<void> {
    this.running = false;
    await Promise.allSettled(this.workers);
    for (const c of this.workerClients) {
      try {
        c.end();
      } catch {
        // ignore
      }
    }
    this.workerClients = [];
    this.workers = [];
    this._logger.log('Server closed');
  }

  // Required by the abstract Server base class (NestJS ≥ 10.3)
  on<K extends keyof Record<string, Function>>(
    _event: K,
    _callback: Record<string, Function>[K],
  ): this {
    return this;
  }

  unwrap<T>(): T {
    return this.workerClients as unknown as T;
  }

  // ─── Workers ──────────────────────────────────────────────────────────────

  private async spawnWorkers(): Promise<void> {
    for (let i = 0; i < this.opts.concurrency; i++) {
      const c = await this.buildClient();
      this.workerClients.push(c);
      this.workers.push(this.runWorker(i));
    }
  }

  private async runWorker(id: number): Promise<void> {
    let clientIdx = id;

    while (this.running) {
      const c = this.workerClients[clientIdx];
      if (!c) break;

      try {
        const job = await this.reserveWithTimeout(c);
        if (!job) continue; // TIMED_OUT – loop again

        await this.handleJob(c, job.jobId, job.payload, id);
      } catch (err) {
        if (!this.running) break;

        this._logger.error(`Worker #${id} connection lost: ${err} — reconnecting…`);

        try {
          this.workerClients[clientIdx].end();
        } catch {
          // ignore
        }

        await this.sleep(this.opts.reconnectDelay);

        try {
          const fresh = await this.buildClient();
          this.workerClients[clientIdx] = fresh;
          this._logger.log(`Worker #${id} reconnected`);
        } catch (reconnErr) {
          this._logger.error(`Worker #${id} reconnect failed: ${reconnErr}`);
          await this.sleep(this.opts.reconnectDelay);
        }
      }
    }
  }

  // ─── Job handling ─────────────────────────────────────────────────────────

  private async handleJob(
    client: FivebeansClient,
    jobId: number,
    rawPayload: Buffer,
    workerId: number,
  ): Promise<void> {
    // 1. Parse
    let msg: BeanstalkMessage;
    try {
      msg = JSON.parse(rawPayload.toString('utf8')) as BeanstalkMessage;
    } catch {
      this._logger.warn(
        `Job #${jobId} (worker #${workerId}): invalid JSON payload — burying`,
      );
      await this.buryJob(client, jobId, 0);
      return;
    }

    if (!msg?.pattern) {
      this._logger.warn(
        `Job #${jobId} (worker #${workerId}): missing "pattern" field — burying`,
      );
      await this.buryJob(client, jobId, 0);
      return;
    }

    // 2. Route
    const handler = this.getHandlerByPattern(msg.pattern);

    if (!handler) {
      this._logger.warn(
        `Job #${jobId} (worker #${workerId}): no handler for pattern "${msg.pattern}" — burying`,
      );
      await this.buryJob(client, jobId, 0);
      return;
    }

    const ctx = new BeanstalkContext([jobId, this.opts.tube]);

    // 3. Invoke handler
    try {
      const result = await handler(msg.data, ctx);
      await firstValueFrom(this.transformToObservable(result as any), {
        defaultValue: undefined,
      });

      if (this.opts.autoAck) {
        await this.destroyJob(client, jobId);
      }
    } catch (handlerErr) {
      this._logger.error(
        `Job #${jobId} (worker #${workerId}) handler threw: ${handlerErr}`,
      );

      const releases = await this.getJobReleases(client, jobId).catch(() => 0);

      if (releases < this.opts.maxRetries) {
        await this.releaseJob(
          client,
          jobId,
          this.opts.retryPriority,
          this.opts.retryDelay,
        );
        this._logger.warn(
          `Job #${jobId}: retry ${releases + 1}/${this.opts.maxRetries} ` +
            `(delay ${this.opts.retryDelay}s)`,
        );
      } else {
        await this.buryJob(client, jobId, 0);
        this._logger.warn(
          `Job #${jobId}: buried — exceeded maxRetries (${this.opts.maxRetries})`,
        );
      }
    }
  }

  // ─── fivebeans helpers (Promise wrappers) ─────────────────────────────────

  private buildClient(): Promise<FivebeansClient> {
    return new Promise<FivebeansClient>((resolve, reject) => {
      const { host, port, tube } = this.opts;
      const c = new FivebeansClient(host, port);

      const onError = (err: unknown) => {
        c.removeAllListeners();
        reject(err);
      };

      c.once('error', onError);
      c.once('connect', () => {
        c.removeListener('error', onError);

        c.watch(tube, (watchErr) => {
          if (watchErr) return reject(watchErr);

          if (tube !== 'default') {
            c.ignore('default', (ignoreErr) => {
              if (ignoreErr) return reject(ignoreErr);
              resolve(c);
            });
          } else {
            resolve(c);
          }
        });
      });

      c.connect();
    });
  }

  private reserveWithTimeout(
    c: FivebeansClient,
  ): Promise<{ jobId: number; payload: Buffer } | null> {
    return new Promise((resolve, reject) => {
      c.reserve_with_timeout(RESERVE_TIMEOUT_SECS, (err, jobId, payload) => {
        if (err) {
          const msg = typeof err === 'string' ? err : (err as Error).message;
          if (msg === 'TIMED_OUT' || msg === 'DEADLINE_SOON') {
            resolve(null);
          } else {
            reject(err);
          }
          return;
        }
        const numericId =
          typeof jobId === 'string' ? parseInt(jobId, 10) : jobId;
        resolve({ jobId: numericId, payload });
      });
    });
  }

  private destroyJob(c: FivebeansClient, jobId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      c.destroy(jobId, (err) => (err ? reject(err) : resolve()));
    });
  }

  private releaseJob(
    c: FivebeansClient,
    jobId: number,
    priority: number,
    delay: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      c.release(jobId, priority, delay, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  private buryJob(
    c: FivebeansClient,
    jobId: number,
    priority: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      c.bury(jobId, priority, (err) => (err ? reject(err) : resolve()));
    });
  }

  private getJobReleases(
    c: FivebeansClient,
    jobId: number,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      c.stats_job(jobId, (err, stats) => {
        if (err) return reject(err);
        resolve(parseInt(stats['releases'] ?? '0', 10));
      });
    });
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
