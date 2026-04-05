# BeanstalkClient

The job producer. Manages a single TCP connection to Beanstalkd.

## Constructor

```ts
new BeanstalkClient(options?: BeanstalkClientOptions)
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | `'localhost'` | Beanstalkd host |
| `port` | `number` | `11300` | Beanstalkd port |
| `tube` | `string` | `'default'` | Tube to put jobs into |
| `priority` | `number` | `0` | Default job priority (lower = higher priority, min 0) |
| `delay` | `number` | `0` | Default delay in seconds before job becomes ready |
| `ttr` | `number` | `60` | Default Time-To-Run in seconds |

## Methods

### `connect(): Promise<void>`

Opens the TCP connection and selects the configured tube with `use`. Idempotent — calling it a second time is a no-op.

```ts
await client.connect();
```

### `disconnect(): void`

Closes the TCP connection.

```ts
client.disconnect();
```

### `emit(pattern, data, options?): Promise<number>`

Puts a job onto the current tube. Returns the Beanstalkd job ID.

```ts
const jobId = await client.emit('order.created', { id: 1 });
```

The job payload is serialised as:
```json
{ "pattern": "order.created", "data": { "id": 1 } }
```

`BeanstalkEmitOptions` — per-call overrides:

| Field | Type | Description |
|---|---|---|
| `priority` | `number` | Override default priority |
| `delay` | `number` | Override default delay (seconds) |
| `ttr` | `number` | Override default TTR (seconds) |

```ts
await client.emit('report.generate', { id: 5 }, { delay: 60, ttr: 300 });
```

### `useTube(tube): Promise<void>`

Switches the active tube without reconnecting. All subsequent `emit()` calls go to the new tube.

```ts
await client.useTube('notifications');
await client.emit('email.send', { to: 'user@example.com' });
```

::: warning
Throws if called before `connect()`.
:::

### `kickBuried(bound?): Promise<number>`

Kicks up to `bound` buried jobs in the **current tube** back to the ready state. Returns the number of jobs actually kicked. Default `bound` is `100`.

```ts
const kicked = await client.kickBuried();     // up to 100
const kicked = await client.kickBuried(10);   // up to 10
```

### `kickJob(jobId): Promise<void>`

Kicks a single buried **or** delayed job back to the ready state by its ID.

```ts
await client.kickJob(42);
```

### `isConnected: boolean`

Property — `true` if the client currently has an open connection.

```ts
if (!client.isConnected) {
  await client.connect();
}
```
