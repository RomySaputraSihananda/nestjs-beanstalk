# @romysaputrasihanandaa/nestjs-beanstalk

NestJS custom transport strategy for [Beanstalkd](https://beanstalkd.github.io/).  
Use `@MessagePattern`, `@Payload`, and `@Ctx` exactly like any built-in NestJS transport.

## Features

- Drop-in transport strategy — wire it up with `NestFactory.createMicroservice()`
- Full `@MessagePattern` / `@Payload` / `@Ctx` support
- Automatic retry with configurable delay and max attempts
- Automatic bury after retries exhausted
- `kickBuried()` / `kickJob()` to resurrect buried jobs
- Concurrency — multiple reserve workers per server instance
- Auto-reconnect on connection loss
- NestJS-style logging (`[Nest] pid - date LEVEL [BeanstalkServer] message`)
- Pluggable logger — pass any `LoggerService` (Winston, Pino, etc.)

## Installation

```bash
npm install @romysaputrasihanandaa/nestjs-beanstalk
```

Peer dependencies (install separately if not already present):

```bash
npm install @nestjs/common @nestjs/core @nestjs/microservices reflect-metadata
```

## Quick Start

### Consumer

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { BeanstalkServer } from '@romysaputrasihanandaa/nestjs-beanstalk';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice(AppModule, {
    strategy: new BeanstalkServer({
      host: 'localhost',
      port: 11300,
      tube: 'orders',
      concurrency: 3,
    }),
  });
  await app.listen();
}
bootstrap();
```

```ts
// orders.controller.ts
import { Controller } from '@nestjs/common';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import { BeanstalkContext } from '@romysaputrasihanandaa/nestjs-beanstalk';

@Controller()
export class OrdersController {
  @MessagePattern('order.created')
  async handleOrderCreated(
    @Payload() data: { id: number; product: string },
    @Ctx() ctx: BeanstalkContext,
  ): Promise<void> {
    console.log(`job #${ctx.getJobId()} on tube "${ctx.getTube()}"`, data);
  }
}
```

### Producer

```ts
import { BeanstalkClient } from '@romysaputrasihanandaa/nestjs-beanstalk';

const client = new BeanstalkClient({ host: 'localhost', tube: 'orders' });
await client.connect();

const jobId = await client.emit('order.created', { id: 1, product: 'Widget' });
console.log('queued job', jobId);

client.disconnect();
```

## API Reference

### `BeanstalkServer`

```ts
new BeanstalkServer(options?: BeanstalkServerOptions)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | `'localhost'` | Beanstalkd host |
| `port` | `number` | `11300` | Beanstalkd port |
| `tube` | `string` | `'default'` | Tube to watch |
| `concurrency` | `number` | `1` | Number of parallel reserve workers |
| `autoAck` | `boolean` | `true` | Delete job automatically after handler succeeds |
| `maxRetries` | `number` | `3` | Max releases before burying the job |
| `retryDelay` | `number` | `5` | Seconds before a released job becomes ready again |
| `retryPriority` | `number` | `0` | Priority used when releasing for retry |
| `ttr` | `number` | `60` | Time-To-Run in seconds |
| `reconnectDelay` | `number` | `3000` | Milliseconds before a reconnect attempt |
| `logger` | `boolean \| LoggerService` | `true` | `true` = NestJS Logger, `false` = silent, or a custom `LoggerService` |

### `BeanstalkClient`

```ts
new BeanstalkClient(options?: BeanstalkClientOptions)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | `'localhost'` | Beanstalkd host |
| `port` | `number` | `11300` | Beanstalkd port |
| `tube` | `string` | `'default'` | Tube to put jobs into |
| `priority` | `number` | `0` | Default job priority (lower = higher priority) |
| `delay` | `number` | `0` | Default delay in seconds before job becomes ready |
| `ttr` | `number` | `60` | Default Time-To-Run in seconds |

#### Methods

```ts
// Connect to Beanstalkd (lazy — called automatically on first emit)
await client.connect(): Promise<void>

// Disconnect
client.disconnect(): void

// Put a job onto the tube — returns the Beanstalkd job ID
await client.emit(pattern: string, data: T, options?: BeanstalkEmitOptions): Promise<number>

// Switch the active tube without reconnecting
await client.useTube(tube: string): Promise<void>

// Kick up to `bound` buried jobs in the current tube back to ready (default: 100)
await client.kickBuried(bound?: number): Promise<number>

// Kick a single buried or delayed job by ID back to ready
await client.kickJob(jobId: number): Promise<void>
```

`BeanstalkEmitOptions` overrides per call:

```ts
{ priority?: number; delay?: number; ttr?: number; }
```

### `BeanstalkContext`

Injected via `@Ctx()`. Extends `BaseRpcContext`.

```ts
ctx.getJobId(): number   // Beanstalkd job ID
ctx.getTube(): string    // tube the job was reserved from
```

### `@BeanstalkPattern(pattern)`

Alias for `@MessagePattern()` — functionally identical, provided for clarity.

```ts
import { BeanstalkPattern } from '@romysaputrasihanandaa/nestjs-beanstalk';

@BeanstalkPattern('order.created')
async handle(@Payload() data: any) { ... }
```

## Message Format

Jobs are stored in Beanstalkd as JSON:

```json
{
  "pattern": "order.created",
  "data": { "id": 1, "product": "Widget" }
}
```

The `pattern` field is matched against registered `@MessagePattern()` handlers.

## Retry & Bury

When a handler throws, the server checks the job's release count via `stats-job`:

```
attempt 1 → throws → releases=0 < maxRetries → release (delay Ns)
attempt 2 → throws → releases=1 < maxRetries → release (delay Ns)
attempt 3 → throws → releases=2 < maxRetries → release (delay Ns)
attempt 4 → throws → releases=3 = maxRetries → bury
```

With the default `maxRetries: 3`, a job is buried after **4 total attempts**.

### Kicking buried jobs

```ts
// Resurrect up to 100 buried jobs in the current tube
const kicked = await client.kickBuried();
console.log(`${kicked} jobs moved back to ready`);

// Resurrect a specific job by ID
await client.kickJob(jobId);
```

## Logging

Logs use the same format as the NestJS framework:

```
[Nest] 1234  - 04/06/2026, 1:57:39 AM     LOG [BeanstalkServer] Listening on localhost:11300 tube="orders" concurrency=3
[Nest] 1234  - 04/06/2026, 1:57:41 AM    WARN [BeanstalkServer] Job #42: retry 1/3 (delay 5s)
[Nest] 1234  - 04/06/2026, 1:57:51 AM    WARN [BeanstalkServer] Job #42: buried — exceeded maxRetries (3)
[Nest] 1234  - 04/06/2026, 1:57:52 AM   ERROR [BeanstalkServer] Job #42 (worker #0) handler threw: Error: ...
```

Disable logging:

```ts
new BeanstalkServer({ logger: false })
```

Custom logger (e.g. Winston):

```ts
new BeanstalkServer({ logger: new WinstonLogger() })
```

## Advanced Usage

### Manual ack

When `autoAck: false`, the job stays reserved after the handler returns. The job is released back to ready when the connection closes (after TTR expires).

```ts
new BeanstalkServer({ autoAck: false })

@MessagePattern('order.created')
async handle(@Payload() data: any, @Ctx() ctx: BeanstalkContext) {
  console.log('processing job', ctx.getJobId());
  // job is not auto-deleted — handle deletion yourself
}
```

### Concurrency

```ts
new BeanstalkServer({ tube: 'orders', concurrency: 5 })
```

Each worker has its own TCP connection and reserves jobs independently.

### Delayed jobs

```ts
await client.emit('report.generate', { reportId: 7 }, { delay: 60 }); // ready in 60s
```

### Multiple tubes from one producer

```ts
const client = new BeanstalkClient({ tube: 'orders' });
await client.connect();

await client.emit('order.created', { id: 1 });

await client.useTube('notifications');
await client.emit('email.send', { to: 'user@example.com' });

client.disconnect();
```

## Project Structure

```
src/
├── client/
│   └── beanstalk.client.ts         # BeanstalkClient — job producer
├── context/
│   └── beanstalk.context.ts        # BeanstalkContext — injected via @Ctx()
├── decorators/
│   └── index.ts                    # @BeanstalkPattern alias
├── interfaces/
│   ├── beanstalk-message.interface.ts
│   └── beanstalk-options.interface.ts
├── server/
│   └── beanstalk.server.ts         # BeanstalkServer — transport strategy
├── types/
│   └── fivebeans.d.ts              # TypeScript declarations for fivebeans
└── index.ts                        # Public API barrel
```

## Running Tests

```bash
# unit tests
npm test

# integration tests (requires Beanstalkd running on 127.0.0.1:11300)
npm run test:e2e
```

## License

MIT
