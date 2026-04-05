# Interfaces

## `BeanstalkServerOptions`

```ts
interface BeanstalkServerOptions {
  host?: string;
  port?: number;
  tube?: string;
  concurrency?: number;
  autoAck?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  retryPriority?: number;
  ttr?: number;
  reconnectDelay?: number;
  logger?: boolean | LoggerService;
}
```

## `BeanstalkClientOptions`

```ts
interface BeanstalkClientOptions {
  host?: string;
  port?: number;
  tube?: string;
  priority?: number;
  delay?: number;
  ttr?: number;
}
```

## `BeanstalkEmitOptions`

Per-call overrides for `BeanstalkClient.emit()`.

```ts
interface BeanstalkEmitOptions {
  priority?: number;
  delay?: number;
  ttr?: number;
}
```

## `BeanstalkMessage`

The JSON structure stored inside every Beanstalkd job.

```ts
interface BeanstalkMessage<T = unknown> {
  /** Routing pattern — matched against @MessagePattern() decorators */
  pattern: string;
  /** Arbitrary job payload */
  data: T;
}
```
