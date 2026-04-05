# Manual Ack

By default, `BeanstalkServer` deletes a job from Beanstalkd automatically after the handler returns successfully (`autoAck: true`). Set `autoAck: false` to take control of job lifecycle yourself.

## Enabling manual ack

```ts
new BeanstalkServer({
  tube: 'orders',
  autoAck: false,
  ttr: 120, // give handlers 2 minutes before Beanstalkd auto-releases
})
```

## Job state when autoAck is off

When `autoAck: false`, after the handler returns the job remains in **reserved** state. Beanstalkd will automatically release it back to **ready** once `ttr` seconds have elapsed.

```
reserved ──── ttr expires ────► ready (re-queued automatically)
```

To prevent the job from re-queuing, you must explicitly delete it using the raw Beanstalkd client or build your own deletion logic via the job ID from context.

## Use cases

- **Conditional ack** — only delete the job if a specific condition is met; otherwise let TTR expire and re-queue.
- **Two-phase processing** — reserve a job, write to a staging table, then delete after the DB transaction commits.
- **Visibility timeout pattern** — similar to SQS — keep the job reserved while processing; it auto-returns on crash.

## Accessing the job ID

Use `@Ctx()` to get the job ID and tube inside the handler:

```ts
@MessagePattern('order.created')
async handle(
  @Payload() data: OrderDto,
  @Ctx() ctx: BeanstalkContext,
): Promise<void> {
  const jobId = ctx.getJobId();
  const tube   = ctx.getTube();

  console.log(`processing reserved job #${jobId} from tube "${tube}"`);

  // handler returns — job stays reserved until TTR expires
}
```

::: warning Retry mechanism still applies
Even with `autoAck: false`, the retry mechanism triggers when the handler **throws**. The job is released or buried as usual. Manual ack only affects the **success** path.
:::

## Comparison

| | `autoAck: true` (default) | `autoAck: false` |
|---|---|---|
| Handler succeeds | Job deleted immediately | Job stays reserved until TTR |
| Handler throws | Retry / bury | Retry / bury |
| App crashes mid-handler | Job released after TTR | Job released after TTR |
