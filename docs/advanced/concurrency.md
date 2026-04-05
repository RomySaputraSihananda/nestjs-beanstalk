# Concurrency

## How workers are spawned

Each worker is an independent loop that:
1. Opens its own TCP connection to Beanstalkd
2. Calls `reserve_with_timeout(2s)` — blocks until a job is available or times out
3. Processes the job
4. Loops back to step 2

Workers run in parallel. With `concurrency: 3`, three jobs can be processed simultaneously.

```ts
new BeanstalkServer({
  tube: 'orders',
  concurrency: 3,
})
```

```
Worker #0  ──── reserve ──── job A ──── handle ──── delete ──── reserve ──── ...
Worker #1  ──── reserve ──── job B ──── handle ──── delete ──── reserve ──── ...
Worker #2  ──── reserve ────────── (waiting) ────── job C ──── handle ──── ...
```

## Choosing a concurrency value

| Workload | Recommended |
|---|---|
| I/O-bound (HTTP calls, DB queries) | `4–16` |
| CPU-bound (image processing, computation) | Number of CPU cores |
| Mixed | `4–8`, tune with load testing |

::: warning Beanstalkd connections
Each worker opens one TCP connection. High concurrency values increase connection count on the Beanstalkd server. Default Beanstalkd supports thousands of connections, but keep this in mind for very high values.
:::

## Per-worker reconnect

Each worker manages its own reconnection independently. If one worker's connection drops, only that worker reconnects — the others continue processing.

```ts
new BeanstalkServer({
  concurrency: 5,
  reconnectDelay: 3000, // ms before each reconnect attempt
})
```

## Example: I/O-bound jobs

```ts
@MessagePattern('email.send')
async sendEmail(@Payload() data: EmailDto): Promise<void> {
  // Each worker waits on the SMTP server independently
  await this.mailer.send(data.to, data.subject, data.body);
}
```

```ts
new BeanstalkServer({ tube: 'emails', concurrency: 10 })
```

## Example: Limiting concurrency per job type

Run separate server instances watching different tubes with different concurrency settings:

```ts
// main.ts
async function bootstrap() {
  // Heavy jobs — limited parallelism
  const heavyApp = await NestFactory.createMicroservice(HeavyModule, {
    strategy: new BeanstalkServer({ tube: 'transcoding', concurrency: 2 }),
  });

  // Light jobs — high parallelism
  const lightApp = await NestFactory.createMicroservice(LightModule, {
    strategy: new BeanstalkServer({ tube: 'notifications', concurrency: 20 }),
  });

  await Promise.all([heavyApp.listen(), lightApp.listen()]);
}
```
