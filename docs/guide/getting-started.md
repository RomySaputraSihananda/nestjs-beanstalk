# Getting Started

## Prerequisites

- Node.js 18+
- A running [Beanstalkd](https://beanstalkd.github.io/) server
- A NestJS project

### Install Beanstalkd (local dev)

::: code-group

```bash [macOS]
brew install beanstalkd
beanstalkd
```

```bash [Ubuntu / Debian]
sudo apt install beanstalkd
beanstalkd
```

```bash [Docker]
docker run -p 11300:11300 schickling/beanstalkd
```

:::

## Installation

```bash
npm install @romysaputrasihanandaa/nestjs-beanstalk
```

Install peer dependencies if not already present:

```bash
npm install @nestjs/common @nestjs/core @nestjs/microservices reflect-metadata
```

## Minimal Setup

### 1. Bootstrap the microservice

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
    }),
  });

  await app.listen();
}
bootstrap();
```

### 2. Handle a job

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
    console.log(`Processing job #${ctx.getJobId()}`, data);
  }
}
```

### 3. Send a job

```ts
import { BeanstalkClient } from '@romysaputrasihanandaa/nestjs-beanstalk';

const client = new BeanstalkClient({ tube: 'orders' });
await client.connect();

await client.emit('order.created', { id: 1, product: 'Widget' });

client.disconnect();
```

## What Happens Under the Hood

```
Producer                  Beanstalkd              Consumer (BeanstalkServer)
   │                          │                           │
   │── put(JSON payload) ────►│                           │
   │                          │◄── reserve ───────────────│
   │                          │─── job id + payload ─────►│
   │                          │                           │── parse JSON
   │                          │                           │── match @MessagePattern
   │                          │                           │── call handler
   │                          │◄── delete (autoAck) ──────│
```

Jobs are stored as JSON with a `pattern` field used for routing:

```json
{
  "pattern": "order.created",
  "data": { "id": 1, "product": "Widget" }
}
```

## Next Steps

- [Consumer →](./consumer) — configure handlers, patterns, and context
- [Producer →](./producer) — emit jobs, switch tubes, kick buried jobs
- [Retry & Bury →](../advanced/retry-bury) — automatic retry flow and dead-letter handling
