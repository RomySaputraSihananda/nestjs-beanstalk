export interface BeanstalkServerOptions {
  /** Beanstalkd host. Default: 'localhost' */
  host?: string;
  /** Beanstalkd port. Default: 11300 */
  port?: number;
  /** Tube to watch. Default: 'default' */
  tube?: string;
  /** Number of concurrent reserve workers. Default: 1 */
  concurrency?: number;
  /**
   * Automatically delete (ack) the job after handler succeeds.
   * Set to false if you want to manually ack via the context. Default: true
   */
  autoAck?: boolean;
  /** Max handler retries before burying the job. Default: 3 */
  maxRetries?: number;
  /** Delay in seconds before retrying a released job. Default: 5 */
  retryDelay?: number;
  /** Priority used when releasing a job for retry. Default: 0 */
  retryPriority?: number;
  /** Time-To-Run for reserved jobs (seconds). Default: 60 */
  ttr?: number;
  /** Delay in ms before attempting a reconnect. Default: 3000 */
  reconnectDelay?: number;
  /**
   * Logging control.
   * - `true`  (default) — use the built-in NestJS Logger (same format as the framework)
   * - `false` — suppress all output
   * - `LoggerService` instance — plug in your own logger (e.g. Winston, Pino)
   */
  logger?: boolean | import('@nestjs/common').LoggerService;
}

export interface BeanstalkClientOptions {
  /** Beanstalkd host. Default: 'localhost' */
  host?: string;
  /** Beanstalkd port. Default: 11300 */
  port?: number;
  /** Tube to use (put jobs into). Default: 'default' */
  tube?: string;
  /** Job priority (lower = higher priority). Default: 0 */
  priority?: number;
  /** Delay in seconds before job becomes ready. Default: 0 */
  delay?: number;
  /** Time-To-Run in seconds. Default: 60 */
  ttr?: number;
}

export interface BeanstalkEmitOptions {
  priority?: number;
  delay?: number;
  ttr?: number;
}
