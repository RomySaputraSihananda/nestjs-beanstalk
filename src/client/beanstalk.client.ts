import { client as FivebeansClient } from 'fivebeans';
import {
  BeanstalkClientOptions,
  BeanstalkEmitOptions,
  BeanstalkMessage,
} from '../interfaces';

const DEFAULTS = {
  host: 'localhost',
  port: 11300,
  tube: 'default',
  priority: 0,
  delay: 0,
  ttr: 60,
} as const satisfies Required<BeanstalkClientOptions>;

/**
 * Beanstalkd producer.  Connect once, emit as many jobs as you need,
 * then disconnect.
 *
 * @example
 * ```ts
 * const client = new BeanstalkClient({ host: 'localhost', tube: 'orders' });
 * await client.connect();
 * const jobId = await client.emit('order.created', { id: 1 });
 * await client.disconnect();
 * ```
 */
export class BeanstalkClient {
  private readonly opts: Required<BeanstalkClientOptions>;
  private _client: FivebeansClient | null = null;
  private _connected = false;

  constructor(options: BeanstalkClientOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  // ─── Connection ───────────────────────────────────────────────────────────

  connect(): Promise<void> {
    if (this._connected) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const { host, port, tube } = this.opts;
      const c = new FivebeansClient(host, port);

      const onError = (err: unknown) => {
        c.removeAllListeners();
        reject(err);
      };

      c.once('error', onError);
      c.once('connect', () => {
        c.removeListener('error', onError);
        c.use(tube, (err) => {
          if (err) return reject(err);
          this._client = c;
          this._connected = true;
          resolve();
        });
      });

      c.connect();
    });
  }

  disconnect(): void {
    if (this._client) {
      try {
        this._client.end();
      } catch {
        // ignore
      }
    }
    this._client = null;
    this._connected = false;
  }

  // ─── Producing ────────────────────────────────────────────────────────────

  /**
   * Put a job onto the Beanstalkd tube and return the assigned job ID.
   *
   * @param pattern  Routing key matched by @MessagePattern() on the consumer.
   * @param data     Arbitrary payload — must be JSON-serialisable.
   * @param options  Per-call overrides for priority / delay / ttr.
   */
  async emit<T = unknown>(
    pattern: string,
    data: T,
    options: BeanstalkEmitOptions = {},
  ): Promise<number> {
    if (!this._connected || !this._client) {
      await this.connect();
    }

    const msg: BeanstalkMessage<T> = { pattern, data };
    const body = JSON.stringify(msg);
    const priority = options.priority ?? this.opts.priority;
    const delay = options.delay ?? this.opts.delay;
    const ttr = options.ttr ?? this.opts.ttr;

    return new Promise<number>((resolve, reject) => {
      this._client!.put(priority, delay, ttr, body, (err, jobId) => {
        if (err) return reject(err);
        // fivebeans delivers IDs from the wire protocol as strings
        resolve(typeof jobId === 'string' ? parseInt(jobId, 10) : jobId);
      });
    });
  }

  /**
   * Change the active tube without creating a new client.
   * Useful when a single client needs to dispatch to multiple tubes.
   */
  useTube(tube: string): Promise<void> {
    if (!this._client) {
      return Promise.reject(new Error('Not connected. Call connect() first.'));
    }
    return new Promise<void>((resolve, reject) => {
      this._client!.use(tube, (err) => {
        if (err) return reject(err);
        this.opts.tube = tube as Required<BeanstalkClientOptions>['tube'];
        resolve();
      });
    });
  }

  // ─── Buried job management ────────────────────────────────────────────────

  /**
   * Kick (resurrect) up to `bound` buried jobs in the **current tube** back
   * to the ready state.  Returns the number of jobs actually kicked.
   *
   * @example
   * ```ts
   * const kicked = await client.kickBuried(100);
   * console.log(`${kicked} jobs moved from buried → ready`);
   * ```
   */
  async kickBuried(bound = 100): Promise<number> {
    if (!this._connected || !this._client) {
      await this.connect();
    }
    return new Promise<number>((resolve, reject) => {
      this._client!.kick(bound, (err, count) => {
        if (err) return reject(err);
        const n = typeof count === 'string' ? parseInt(count, 10) : count;
        resolve(n);
      });
    });
  }

  /**
   * Kick a single buried **or** delayed job back to the ready state by its ID.
   *
   * @example
   * ```ts
   * await client.kickJob(jobId);
   * ```
   */
  async kickJob(jobId: number): Promise<void> {
    if (!this._connected || !this._client) {
      await this.connect();
    }
    return new Promise<void>((resolve, reject) => {
      this._client!.kick_job(jobId, (err) => (err ? reject(err) : resolve()));
    });
  }

  get isConnected(): boolean {
    return this._connected;
  }
}
