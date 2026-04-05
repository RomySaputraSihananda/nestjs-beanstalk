import 'reflect-metadata';
import { client as FivebeansClient } from 'fivebeans';
import { BeanstalkClient } from '../src/client/beanstalk.client';
import { BeanstalkServer } from '../src/server/beanstalk.server';
import { BeanstalkContext } from '../src/context/beanstalk.context';
import {
  HOST,
  PORT,
  addHandler,
  rawConnect,
  sleep,
  startServer,
  statsJob,
  tube,
  waitForCalls,
} from './helpers';

jest.setTimeout(30_000);

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function makeClient(t: string): Promise<BeanstalkClient> {
  const c = new BeanstalkClient({ host: HOST, port: PORT, tube: t });
  await c.connect();
  return c;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

describe('BeanstalkServer — lifecycle', () => {
  it('listen() calls the callback without error', async () => {
    const server = new BeanstalkServer({
      host: HOST,
      port: PORT,
      tube: tube('lifecycle'),
      logger: false,
    });

    await expect(startServer(server)).resolves.toBeUndefined();
    await server.close();
  });

  it('close() resolves cleanly', async () => {
    const server = new BeanstalkServer({
      host: HOST,
      port: PORT,
      tube: tube('close'),
      logger: false,
    });
    await startServer(server);
    await expect(server.close()).resolves.toBeUndefined();
  });

  it('concurrency=3 spawns 3 workers without error', async () => {
    const server = new BeanstalkServer({
      host: HOST,
      port: PORT,
      tube: tube('conc'),
      concurrency: 3,
      logger: false,
    });
    await expect(startServer(server)).resolves.toBeUndefined();
    await server.close();
  });
});

// ─── Routing ─────────────────────────────────────────────────────────────────

describe('BeanstalkServer — routing', () => {
  let server: BeanstalkServer;
  let client: BeanstalkClient;
  let t: string;

  beforeEach(async () => {
    t = tube('routing');
    server = new BeanstalkServer({
      host: HOST,
      port: PORT,
      tube: t,
      autoAck: true,
      logger: false,
    });
    client = await makeClient(t);
  });

  afterEach(async () => {
    client.disconnect();
    await server.close();
  });

  it('routes job to the correct @MessagePattern handler', async () => {
    const handler = jest.fn(async () => {});
    addHandler(server, 'order.created', handler);
    await startServer(server);

    await client.emit('order.created', { id: 1 });
    await waitForCalls(handler, 1);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes the correct data to the handler', async () => {
    const payload = { id: 7, product: 'Gadget', qty: 2 };
    const received: unknown[] = [];

    addHandler(server, 'order.placed', async (data: unknown) => {
      received.push(data);
    });
    await startServer(server);

    await client.emit('order.placed', payload);
    await waitForCalls(
      jest.fn().mockImplementation(() => received.length >= 1),
      0,
      8_000,
    ).catch(() => {}); // we use waitFor pattern below

    // poll
    let elapsed = 0;
    while (received.length === 0 && elapsed < 8_000) {
      await sleep(100);
      elapsed += 100;
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(payload);
  });

  it('passes a BeanstalkContext with correct jobId and tube', async () => {
    let capturedCtx: BeanstalkContext | undefined;
    let capturedJobId: number | undefined;

    addHandler(
      server,
      'ctx.test',
      async (data: unknown, ctx: BeanstalkContext) => {
        capturedCtx = ctx;
      },
    );
    await startServer(server);

    capturedJobId = await client.emit('ctx.test', {});

    let elapsed = 0;
    while (!capturedCtx && elapsed < 8_000) {
      await sleep(100);
      elapsed += 100;
    }

    expect(capturedCtx).toBeInstanceOf(BeanstalkContext);
    expect(capturedCtx!.getJobId()).toBe(capturedJobId);
    expect(capturedCtx!.getTube()).toBe(t);
  });

  it('routes multiple different patterns independently', async () => {
    const handlerA = jest.fn(async () => {});
    const handlerB = jest.fn(async () => {});
    addHandler(server, 'ev.a', handlerA);
    addHandler(server, 'ev.b', handlerB);
    await startServer(server);

    await client.emit('ev.a', { n: 1 });
    await client.emit('ev.b', { n: 2 });
    await waitForCalls(handlerA, 1);
    await waitForCalls(handlerB, 1);

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect((handlerA.mock.calls as any)[0][0]).toEqual({ n: 1 });
    expect((handlerB.mock.calls as any)[0][0]).toEqual({ n: 2 });
  });
});

// ─── Auto-ack ────────────────────────────────────────────────────────────────

describe('BeanstalkServer — autoAck', () => {
  let verifier: FivebeansClient;

  beforeAll(async () => {
    verifier = await rawConnect();
  });
  afterAll(() => verifier.end());

  it('autoAck=true: job is deleted after handler succeeds', async () => {
    const t = tube('ack-true');
    const server = new BeanstalkServer({
      host: HOST, port: PORT, tube: t, autoAck: true, logger: false,
    });
    const client = await makeClient(t);

    const done = jest.fn(async () => {});
    addHandler(server, 'ack.yes', done);
    await startServer(server);

    const jobId = await client.emit('ack.yes', {});
    await waitForCalls(done, 1);
    await sleep(300); // let destroy() complete

    const stats = await statsJob(verifier, jobId);
    expect(stats).toBeNull(); // NOT_FOUND → job deleted

    client.disconnect();
    await server.close();
  });

  it('autoAck=false: job is NOT deleted after handler succeeds', async () => {
    const t = tube('ack-false');
    const server = new BeanstalkServer({
      host: HOST, port: PORT, tube: t, autoAck: false, ttr: 30, logger: false,
    });
    const client = await makeClient(t);

    const done = jest.fn(async () => {});
    addHandler(server, 'ack.no', done);
    await startServer(server);

    const jobId = await client.emit('ack.no', {});
    await waitForCalls(done, 1);
    await sleep(300);

    // Job must still exist (in 'reserved' state)
    const stats = await statsJob(verifier, jobId);
    expect(stats).not.toBeNull();
    expect(stats!['state']).toBe('reserved');

    client.disconnect();
    await server.close();

    // cleanup: job goes ready after server closes; delete it
    await sleep(500);
    await new Promise<void>((res) => verifier.destroy(jobId, () => res()));
  });
});

// ─── Error handling ──────────────────────────────────────────────────────────

describe('BeanstalkServer — error handling', () => {
  let verifier: FivebeansClient;

  beforeAll(async () => {
    verifier = await rawConnect();
  });
  afterAll(() => verifier.end());

  it('invalid JSON: buries the job without calling any handler', async () => {
    const t = tube('invalid-json');
    const server = new BeanstalkServer({
      host: HOST, port: PORT, tube: t, logger: false,
    });
    const handler = jest.fn(async () => {});
    addHandler(server, 'any', handler);
    await startServer(server);

    // Inject a raw malformed job directly via fivebeans
    const producer = await rawConnect();
    await new Promise<void>((res, rej) =>
      producer.use(t, (e) => (e ? rej(e) : res())),
    );
    let jobId: number;
    await new Promise<void>((res, rej) =>
      producer.put(0, 0, 30, '{not valid json', (e, id) => {
        if (e) return rej(e);
        jobId = id;
        res();
      }),
    );
    producer.end();

    // Wait for the server to process the job
    await sleep(3_000);

    expect(handler).not.toHaveBeenCalled();

    const stats = await statsJob(verifier, jobId!);
    expect(stats).not.toBeNull();
    expect(stats!['state']).toBe('buried');

    // cleanup
    await new Promise<void>((res) => verifier.destroy(jobId!, () => res()));
    await server.close();
  });

  it('unknown pattern: buries the job without calling any handler', async () => {
    const t = tube('unknown-pat');
    const server = new BeanstalkServer({
      host: HOST, port: PORT, tube: t, logger: false,
    });
    // Register handler for a DIFFERENT pattern
    const handler = jest.fn(async () => {});
    addHandler(server, 'known.pattern', handler);
    await startServer(server);

    const client = await makeClient(t);
    const jobId = await client.emit('unknown.pattern', { x: 1 });

    await sleep(3_000);

    expect(handler).not.toHaveBeenCalled();

    const stats = await statsJob(verifier, jobId);
    expect(stats).not.toBeNull();
    expect(stats!['state']).toBe('buried');

    // cleanup
    await new Promise<void>((res) => verifier.destroy(jobId, () => res()));
    client.disconnect();
    await server.close();
  });
});

// ─── Retry mechanism ─────────────────────────────────────────────────────────

describe('BeanstalkServer — retry mechanism', () => {
  let verifier: FivebeansClient;

  beforeAll(async () => {
    verifier = await rawConnect();
  });
  afterAll(() => verifier.end());

  it('retries job on handler error and succeeds on final attempt', async () => {
    const t = tube('retry-ok');
    const server = new BeanstalkServer({
      host: HOST,
      port: PORT,
      tube: t,
      autoAck: true,
      maxRetries: 3,   // allow 3 releases = 4 total attempts
      retryDelay: 1,   // 1 second between retries
      logger: false,
    });
    const client = await makeClient(t);

    let callCount = 0;
    const handler = jest.fn(async () => {
      callCount++;
      if (callCount < 3) throw new Error('simulated failure');
      // 3rd call succeeds
    });
    addHandler(server, 'retry.event', handler);
    await startServer(server);

    const jobId = await client.emit('retry.event', { id: 1 });
    await waitForCalls(handler, 3, 20_000);

    expect(handler).toHaveBeenCalledTimes(3);

    await sleep(300);
    // Job should be deleted (auto-ack on success)
    const stats = await statsJob(verifier, jobId);
    expect(stats).toBeNull();

    client.disconnect();
    await server.close();
  });

  it('buries job after maxRetries exhausted', async () => {
    const t = tube('retry-bury');
    const server = new BeanstalkServer({
      host: HOST,
      port: PORT,
      tube: t,
      autoAck: true,
      maxRetries: 2,   // releases=2 → bury on 3rd attempt
      retryDelay: 1,
      logger: false,
    });
    const client = await makeClient(t);

    const handler = jest.fn(async () => {
      throw new Error('always fail');
    });
    addHandler(server, 'bury.event', handler);
    await startServer(server);

    const jobId = await client.emit('bury.event', {});

    // With maxRetries=2 the handler is called 3 times (0 releases, 1 release, 2 releases → bury)
    await waitForCalls(handler, 3, 20_000);
    await sleep(500); // let bury() complete

    expect(handler).toHaveBeenCalledTimes(3);

    const stats = await statsJob(verifier, jobId);
    expect(stats).not.toBeNull();
    expect(stats!['state']).toBe('buried');

    // cleanup
    await new Promise<void>((res) => verifier.destroy(jobId, () => res()));
    client.disconnect();
    await server.close();
  });

  it('each retry receives the same original data', async () => {
    const t = tube('retry-data');
    const server = new BeanstalkServer({
      host: HOST,
      port: PORT,
      tube: t,
      maxRetries: 2,
      retryDelay: 1,
      logger: false,
    });
    const client = await makeClient(t);

    const received: unknown[] = [];
    const handler = jest.fn(async (data: unknown) => {
      received.push(data);
      throw new Error('fail');
    });
    addHandler(server, 'data.retry', handler);
    await startServer(server);

    const payload = { order: 42 };
    await client.emit('data.retry', payload);

    await waitForCalls(handler, 3, 20_000);
    await sleep(300);

    // All 3 calls must have received identical payload
    expect(received).toHaveLength(3);
    received.forEach((d) => expect(d).toEqual(payload));

    // cleanup: peek_buried on the tube then destroy
    await new Promise<void>((res) => {
      verifier.peek_buried((e, id) => {
        if (e || !id) return res();
        verifier.destroy(id, () => res());
      });
    });

    client.disconnect();
    await server.close();
  });
});

// ─── Concurrency ─────────────────────────────────────────────────────────────

describe('BeanstalkServer — concurrency', () => {
  it('processes multiple jobs in parallel with concurrency=3', async () => {
    const t = tube('concurrent');
    const server = new BeanstalkServer({
      host: HOST,
      port: PORT,
      tube: t,
      concurrency: 3,
      autoAck: true,
      logger: false,
    });
    const client = await makeClient(t);

    const startTimes: number[] = [];
    const handler = jest.fn(async () => {
      startTimes.push(Date.now());
      await sleep(500); // each job takes 500 ms
    });
    addHandler(server, 'slow.job', handler);
    await startServer(server);

    const before = Date.now();
    // Emit 3 jobs
    await Promise.all([
      client.emit('slow.job', { n: 1 }),
      client.emit('slow.job', { n: 2 }),
      client.emit('slow.job', { n: 3 }),
    ]);

    await waitForCalls(handler, 3, 10_000);
    const elapsed = Date.now() - before;

    // With concurrency=3, 3 × 500 ms jobs should finish in ~500-900 ms
    // (not 1500 ms which would indicate serial processing)
    expect(elapsed).toBeLessThan(1_400);
    expect(handler).toHaveBeenCalledTimes(3);

    client.disconnect();
    await server.close();
  });
});
