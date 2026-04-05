# Producer

`BeanstalkClient` is a lightweight Beanstalkd producer. It manages a single TCP connection and exposes methods to put, manage, and kick jobs.

## Basic usage

```ts
import { BeanstalkClient } from '@romysaputrasihanandaa/nestjs-beanstalk';

const client = new BeanstalkClient({
  host: 'localhost',
  port: 11300,
  tube: 'orders',
});

await client.connect();

const jobId = await client.emit('order.created', { id: 1, product: 'Widget' });
console.log('queued job', jobId);

client.disconnect();
```

## Lazy connect

You can skip `connect()` — the client will connect automatically on the first `emit()` call.

```ts
const client = new BeanstalkClient({ tube: 'orders' });

// connect() is called internally
const jobId = await client.emit('order.created', { id: 1 });
```

## Per-call options

Override `priority`, `delay`, or `ttr` for individual jobs:

```ts
// Delayed job — becomes ready in 60 seconds
await client.emit(
  'report.generate',
  { reportId: 7 },
  { delay: 60 },
);

// High-priority job (lower number = higher priority)
await client.emit(
  'order.urgent',
  { id: 99 },
  { priority: 0 },
);

// Custom TTR
await client.emit(
  'video.transcode',
  { file: 'input.mp4' },
  { ttr: 300 }, // 5 minutes to process
);
```

## Switching tubes

Switch the active tube at runtime without reconnecting:

```ts
const client = new BeanstalkClient({ tube: 'orders' });
await client.connect();

await client.emit('order.created', { id: 1 });     // → orders

await client.useTube('notifications');
await client.emit('email.send', { to: 'a@b.com' }); // → notifications

await client.useTube('analytics');
await client.emit('event.track', { name: 'checkout' }); // → analytics

client.disconnect();
```

## Bulk emit

```ts
const orders = [
  { id: 1, product: 'Widget A' },
  { id: 2, product: 'Widget B' },
  { id: 3, product: 'Widget C' },
];

const jobIds = await Promise.all(
  orders.map((o) => client.emit('order.created', o)),
);
console.log('queued', jobIds.length, 'jobs');
```

## Using inside NestJS (service / HTTP handler)

```ts
// orders.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BeanstalkClient } from '@romysaputrasihanandaa/nestjs-beanstalk';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly client = new BeanstalkClient({ tube: 'orders' });

  async onModuleInit() {
    await this.client.connect();
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  async queueOrder(data: CreateOrderDto): Promise<number> {
    return this.client.emit('order.created', data);
  }
}
```

## Kicking buried jobs

Buried jobs can be resurrected at any time:

```ts
// Kick up to 100 buried jobs in the current tube back to ready
const kicked = await client.kickBuried();
console.log(`${kicked} jobs moved back to ready`);

// Kick a specific job by ID
await client.kickJob(42);
```

See [Retry & Bury →](../advanced/retry-bury) for more detail.
