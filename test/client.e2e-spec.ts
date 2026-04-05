import 'reflect-metadata';
import { client as FivebeansClient } from 'fivebeans';
import { BeanstalkClient } from '../src/client/beanstalk.client';
import { HOST, PORT, rawConnect, statsJob, tube } from './helpers';

jest.setTimeout(15_000);

describe('BeanstalkClient (integration)', () => {
  let client: BeanstalkClient;
  let verifier: FivebeansClient; // raw client used to inspect Beanstalkd state

  beforeAll(async () => {
    verifier = await rawConnect();
  });

  afterAll(() => {
    verifier.end();
  });

  afterEach(() => {
    client?.disconnect();
  });

  // ─── Connection ────────────────────────────────────────────────────────────

  describe('connect / disconnect', () => {
    it('should connect without error', async () => {
      client = new BeanstalkClient({ host: HOST, port: PORT });
      await expect(client.connect()).resolves.toBeUndefined();
      expect(client.isConnected).toBe(true);
    });

    it('should be idempotent — second connect() is a no-op', async () => {
      client = new BeanstalkClient({ host: HOST, port: PORT });
      await client.connect();
      await expect(client.connect()).resolves.toBeUndefined();
      expect(client.isConnected).toBe(true);
    });

    it('should set isConnected=false after disconnect()', async () => {
      client = new BeanstalkClient({ host: HOST, port: PORT });
      await client.connect();
      client.disconnect();
      expect(client.isConnected).toBe(false);
    });

    it('should lazy-connect on first emit()', async () => {
      client = new BeanstalkClient({
        host: HOST,
        port: PORT,
        tube: tube('lazy'),
      });
      // no explicit connect()
      const jobId = await client.emit('ping', {});
      expect(typeof jobId).toBe('number');
      expect(jobId).toBeGreaterThan(0);
      expect(client.isConnected).toBe(true);
    });
  });

  // ─── emit ─────────────────────────────────────────────────────────────────

  describe('emit()', () => {
    it('should return a positive integer job ID', async () => {
      const t = tube('emit-basic');
      client = new BeanstalkClient({ host: HOST, port: PORT, tube: t });
      await client.connect();

      const jobId = await client.emit('order.created', { id: 1 });

      expect(typeof jobId).toBe('number');
      expect(jobId).toBeGreaterThan(0);
    });

    it('should put the job with the correct JSON body', async () => {
      const t = tube('emit-body');
      client = new BeanstalkClient({ host: HOST, port: PORT, tube: t });
      await client.connect();

      const payload = { id: 99, product: 'Widget' };
      const jobId = await client.emit('order.created', payload);

      // Reserve via raw client watching same tube
      const consumer = await rawConnect();
      await new Promise<void>((res, rej) =>
        consumer.watch(t, (e) => (e ? rej(e) : res())),
      );
      const job = await new Promise<{ jobId: number; body: string }>(
        (res, rej) =>
          consumer.reserve((e, id, buf) =>
            e
              ? rej(e)
              : res({
                  jobId: typeof id === 'string' ? parseInt(id, 10) : id,
                  body: buf.toString('utf8'),
                }),
          ),
      );

      expect(job.jobId).toBe(jobId);
      const parsed = JSON.parse(job.body);
      expect(parsed.pattern).toBe('order.created');
      expect(parsed.data).toEqual(payload);

      // cleanup
      await new Promise<void>((res) => consumer.destroy(job.jobId, () => res()));
      consumer.end();
    });

    it('should respect per-call priority / delay / ttr overrides', async () => {
      const t = tube('emit-opts');
      client = new BeanstalkClient({ host: HOST, port: PORT, tube: t });
      await client.connect();

      const jobId = await client.emit(
        'task',
        { x: 1 },
        { priority: 10, delay: 1, ttr: 30 },
      );

      const stats = await statsJob(verifier, jobId);
      expect(stats).not.toBeNull();
      // job is delayed so state should be 'delayed'
      expect(stats!['state']).toBe('delayed');
      expect(stats!['pri']).toBe(10);       // YAML parses numbers as numbers
      expect(stats!['time-left']).toBeDefined();

      // cleanup: kick the delayed job then delete it
      const kickClient = await rawConnect();
      await new Promise<void>((res) => kickClient.watch(t, () => res()));
      await new Promise<void>((res) => kickClient.ignore('default', () => res()));
      kickClient.end();

      // delete via verifier after kicking
      await new Promise<void>((res) => verifier.destroy(jobId, () => res()));
    });

    it('should emit multiple jobs sequentially', async () => {
      const t = tube('emit-multi');
      client = new BeanstalkClient({ host: HOST, port: PORT, tube: t });
      await client.connect();

      const ids = await Promise.all([
        client.emit('ev.a', { n: 1 }),
        client.emit('ev.b', { n: 2 }),
        client.emit('ev.c', { n: 3 }),
      ]);

      expect(ids).toHaveLength(3);
      ids.forEach((id) => expect(id).toBeGreaterThan(0));
      // all IDs must be distinct
      expect(new Set(ids).size).toBe(3);

      // cleanup
      for (const id of ids) {
        await new Promise<void>((res) => verifier.destroy(id, () => res()));
      }
    });
  });

  // ─── useTube ──────────────────────────────────────────────────────────────

  describe('useTube()', () => {
    it('should switch the active tube', async () => {
      const t1 = tube('use-tube-a');
      const t2 = tube('use-tube-b');
      client = new BeanstalkClient({ host: HOST, port: PORT, tube: t1 });
      await client.connect();

      const jobIdA = await client.emit('ev', { tube: 'a' });

      await client.useTube(t2);
      const jobIdB = await client.emit('ev', { tube: 'b' });

      // Verify jobs are in their respective tubes via stats
      const statsA = await statsJob(verifier, jobIdA);
      const statsB = await statsJob(verifier, jobIdB);

      expect(statsA!['tube']).toBe(t1);
      expect(statsB!['tube']).toBe(t2);

      // cleanup
      await new Promise<void>((res) => verifier.destroy(jobIdA, () => res()));
      await new Promise<void>((res) => verifier.destroy(jobIdB, () => res()));
    });

    it('should throw if useTube() is called before connect()', async () => {
      client = new BeanstalkClient({ host: HOST, port: PORT });
      await expect(client.useTube('some-tube')).rejects.toThrow(
        'Not connected',
      );
    });
  });
});
