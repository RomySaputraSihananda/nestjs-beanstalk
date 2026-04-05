# BeanstalkServer

The NestJS custom transport strategy. Extends `Server` and implements `CustomTransportStrategy`.

## Constructor

```ts
new BeanstalkServer(options?: BeanstalkServerOptions)
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | `'localhost'` | Beanstalkd host |
| `port` | `number` | `11300` | Beanstalkd port |
| `tube` | `string` | `'default'` | Tube to watch for jobs |
| `concurrency` | `number` | `1` | Number of concurrent reserve workers |
| `autoAck` | `boolean` | `true` | Delete job automatically after handler succeeds |
| `maxRetries` | `number` | `3` | Max releases before burying a failed job |
| `retryDelay` | `number` | `5` | Seconds before a released job becomes ready again |
| `retryPriority` | `number` | `0` | Priority used when releasing a job for retry |
| `ttr` | `number` | `60` | Time-To-Run in seconds |
| `reconnectDelay` | `number` | `3000` | Milliseconds before a reconnect attempt |
| `logger` | `boolean \| LoggerService` | `true` | `true` = NestJS Logger, `false` = silent, `LoggerService` = custom |

## Usage

```ts
import { NestFactory } from '@nestjs/core';
import { BeanstalkServer } from '@romysaputrasihanandaa/nestjs-beanstalk';
import { AppModule } from './app.module';

const app = await NestFactory.createMicroservice(AppModule, {
  strategy: new BeanstalkServer({
    host: 'localhost',
    port: 11300,
    tube: 'orders',
    concurrency: 5,
    maxRetries: 3,
    retryDelay: 10,
    reconnectDelay: 3000,
    logger: true,
  }),
});

await app.listen();
```

## Job flow

```
reserve_with_timeout(2s)
       │
       ▼
  Parse JSON payload
       │
       ├─ invalid JSON       → bury
       ├─ missing "pattern"  → bury
       ├─ no matching handler → bury
       │
       ▼
  Call handler(data, BeanstalkContext)
       │
       ├─ success + autoAck=true  → destroy
       ├─ success + autoAck=false → leave reserved
       │
       └─ throws
              │
              ├─ releases < maxRetries → release (retryDelay, retryPriority)
              └─ releases ≥ maxRetries → bury
```

## Worker lifecycle

Each worker:
1. Opens its own fivebeans TCP connection
2. Watches the configured tube (and ignores `default` if tube ≠ `'default'`)
3. Loops: `reserve_with_timeout(2s)` → process job → repeat
4. On connection error: waits `reconnectDelay` ms, then reconnects

## Graceful shutdown

Call `app.close()` (or `server.close()` directly). The server:
1. Sets `running = false` — all workers stop after the current job
2. Waits for in-flight jobs to finish
3. Closes all TCP connections

```ts
const app = await NestFactory.createMicroservice(AppModule, { strategy });

process.on('SIGTERM', async () => {
  await app.close();
  process.exit(0);
});
```
