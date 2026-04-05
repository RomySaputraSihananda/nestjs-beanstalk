/**
 * End-to-end smoke test: BeanstalkClient → BeanstalkServer full round-trip.
 */
import 'reflect-metadata';
import { BeanstalkClient } from '../src/client/beanstalk.client';
import { BeanstalkServer } from '../src/server/beanstalk.server';
import {
  HOST,
  PORT,
  addHandler,
  sleep,
  startServer,
  tube,
  waitForCalls,
} from './helpers';

async function makeClient(t: string): Promise<BeanstalkClient> {
  const c = new BeanstalkClient({ host: HOST, port: PORT, tube: t });
  await c.connect();
  return c;
}

jest.setTimeout(20_000);

describe('End-to-end: BeanstalkClient → BeanstalkServer', () => {
  it('producer emits a job and consumer handler receives the correct payload', async () => {
    const t = tube('e2e-basic');
    const server = new BeanstalkServer({
      host: HOST, port: PORT, tube: t, autoAck: true, logger: false,
    });
    const client = await makeClient(t);

    const payload = { orderId: 123, product: 'Widget', qty: 5 };
    const received: unknown[] = [];

    addHandler(server, 'order.created', async (data: unknown) => {
      received.push(data);
    });
    await startServer(server);

    await client.emit('order.created', payload);

    // Poll until handler is called
    let elapsed = 0;
    while (received.length === 0 && elapsed < 8_000) {
      await sleep(100);
      elapsed += 100;
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(payload);

    client.disconnect();
    await server.close();
  });

  it('multiple producers emit concurrently and server handles all jobs', async () => {
    const t = tube('e2e-multi-producer');
    const server = new BeanstalkServer({
      host: HOST, port: PORT, tube: t, concurrency: 2, autoAck: true, logger: false,
    });

    const handler = jest.fn(async () => {});
    addHandler(server, 'ping', handler);
    await startServer(server);

    // Three independent producers
    const [c1, c2, c3] = await Promise.all([
      makeClient(t),
      makeClient(t),
      makeClient(t),
    ]);

    await Promise.all([
      c1.emit('ping', { from: 1 }),
      c2.emit('ping', { from: 2 }),
      c3.emit('ping', { from: 3 }),
    ]);

    await waitForCalls(handler, 3, 12_000);
    expect(handler).toHaveBeenCalledTimes(3);

    // All payloads must be present
    const froms = (handler.mock.calls as unknown as [{ from: number }][]).map(
      ([d]) => d.from,
    );
    expect(froms.sort()).toEqual([1, 2, 3]);

    c1.disconnect();
    c2.disconnect();
    c3.disconnect();
    await server.close();
  });
});
