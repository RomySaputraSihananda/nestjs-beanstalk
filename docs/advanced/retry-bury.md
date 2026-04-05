# Retry & Bury

## How retry works

When a handler throws, the server checks the job's `releases` counter via Beanstalkd's `stats-job` command and decides whether to retry or bury.

```
Handler throws
      │
      ▼
releases < maxRetries?
      │
      ├── YES → release(jobId, retryPriority, retryDelay)
      │             job is back to "ready" after retryDelay seconds
      │
      └── NO  → bury(jobId, 0)
                  job moves to "buried" state
```

### Example with `maxRetries: 3`

```
attempt 1 → throws → releases=0 (0 < 3) → release, wait 5s
attempt 2 → throws → releases=1 (1 < 3) → release, wait 5s
attempt 3 → throws → releases=2 (2 < 3) → release, wait 5s
attempt 4 → throws → releases=3 (3 ≥ 3) → bury ⚰️
```

A job is buried after **maxRetries + 1** total attempts.

## Configuration

```ts
new BeanstalkServer({
  maxRetries: 3,      // bury after 4 total attempts
  retryDelay: 10,     // 10 seconds between retries
  retryPriority: 0,   // priority when re-queued
})
```

## Beanstalkd job states

```
         put                reserve
ready ──────────► ready ──────────► reserved
  ▲                  ▲                  │
  │    kick          │ release          │ delete (autoAck)
  │◄─────────── buried ◄────────────────┤
                                        │ bury (maxRetries exhausted)
                                        └──────────────────► buried
```

## Kicking buried jobs

Buried jobs sit in a dead-letter queue. Use `BeanstalkClient` to resurrect them.

### Kick all buried jobs in a tube

```ts
const client = new BeanstalkClient({ tube: 'orders' });
await client.connect();

const kicked = await client.kickBuried(100); // up to 100 jobs
console.log(`${kicked} job(s) moved back to ready`);

client.disconnect();
```

### Kick a specific job by ID

```ts
await client.kickJob(42);
```

::: tip When to kick
- After deploying a bug fix that caused jobs to fail
- After restoring a downstream service that was unavailable
- As part of a manual retry script or admin endpoint
:::

## Disabling retry

Set `maxRetries: 0` to bury a job immediately on the first failure:

```ts
new BeanstalkServer({ maxRetries: 0 })
```

## Invalid or unroutable jobs

Jobs that cannot be parsed or routed are buried immediately — they are **not** retried, since retrying would produce the same result:

| Condition | Action |
|---|---|
| Invalid JSON payload | Bury immediately |
| Missing `pattern` field | Bury immediately |
| No handler for pattern | Bury immediately |
| Handler throws | Retry up to `maxRetries`, then bury |

## Full example

```ts
// Consumer: handler that may fail transiently
@MessagePattern('order.created')
async handle(@Payload() data: any): Promise<void> {
  const result = await this.paymentService.charge(data.id);
  if (!result.ok) {
    throw new Error(`payment failed: ${result.reason}`);
    // → triggers retry
  }
}
```

```ts
// Admin script: kick all buried jobs after payment service is restored
const client = new BeanstalkClient({ tube: 'orders' });
await client.connect();
const kicked = await client.kickBuried();
console.log(`Requeued ${kicked} jobs`);
client.disconnect();
```
