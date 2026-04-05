import { client as FivebeansClient } from 'fivebeans';
import { BeanstalkServer } from '../src/server/beanstalk.server';
import { MessageHandler } from '@nestjs/microservices';

export const HOST = '127.0.0.1';
export const PORT = 11300;

/** Generate a unique tube name so tests never share state. */
export const tube = (label: string) =>
  `test-${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

/** Wrap server.listen() in a Promise. */
export function startServer(server: BeanstalkServer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.listen((err?: unknown) => (err ? reject(err) : resolve()));
  });
}

/**
 * Register a handler on the server.
 * NestJS's Server.addHandler() normalises via transformPatternToRoute(),
 * which returns plain strings as-is — so we pass the raw pattern directly,
 * exactly as @MessagePattern() would.
 */
export function addHandler(
  server: BeanstalkServer,
  pattern: string,
  fn: MessageHandler,
): void {
  server.addHandler(pattern, fn);
}

/** Poll until a jest.Mock has been called `count` times (or timeout). */
export function waitForCalls(
  fn: jest.Mock,
  count: number,
  timeoutMs = 12_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout: handler called ${fn.mock.calls.length}/${count} times`,
          ),
        ),
      timeoutMs,
    );
    const interval = setInterval(() => {
      if (fn.mock.calls.length >= count) {
        clearInterval(interval);
        clearTimeout(deadline);
        resolve();
      }
    }, 100);
  });
}

/** Wait for an arbitrary condition to become true (or timeout). */
export function waitFor(
  condition: () => boolean,
  timeoutMs = 8_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error('Timeout: condition never met')),
      timeoutMs,
    );
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        clearTimeout(deadline);
        resolve();
      }
    }, 100);
  });
}

/** Open a raw fivebeans client connection (no tube setup). */
export function rawConnect(): Promise<FivebeansClient> {
  return new Promise<FivebeansClient>((resolve, reject) => {
    const c = new FivebeansClient(HOST, PORT);
    c.once('error', reject);
    c.once('connect', () => resolve(c));
    c.connect();
  });
}

/** stats-job wrapper — returns null for NOT_FOUND / any error. */
export function statsJob(
  c: FivebeansClient,
  jobId: number,
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    c.stats_job(jobId, (err, stats) => (err ? resolve(null) : resolve(stats)));
  });
}

/** Small convenience sleep. */
export const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));
