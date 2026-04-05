# Logging

## Default behaviour

`BeanstalkServer` uses NestJS's built-in `Logger` by default. Logs are emitted with the context name `BeanstalkServer` and follow the exact same format as the NestJS framework:

```
[Nest] 1234  - 04/06/2026, 1:57:39 AM     LOG [BeanstalkServer] Listening on localhost:11300 tube="orders" concurrency=3
[Nest] 1234  - 04/06/2026, 1:57:41 AM    WARN [BeanstalkServer] Job #42: retry 1/3 (delay 5s)
[Nest] 1234  - 04/06/2026, 1:57:51 AM    WARN [BeanstalkServer] Job #42: buried — exceeded maxRetries (3)
[Nest] 1234  - 04/06/2026, 1:57:52 AM   ERROR [BeanstalkServer] Job #42 (worker #0) handler threw: Error: payment failed
[Nest] 1234  - 04/06/2026, 1:57:55 AM     LOG [BeanstalkServer] Worker #0 reconnected
[Nest] 1234  - 04/06/2026, 1:58:01 AM     LOG [BeanstalkServer] Server closed
```

## Log events

| Level | Event |
|---|---|
| `LOG` | Server started, worker reconnected, server closed |
| `WARN` | Job retried, job buried, invalid payload, unknown pattern |
| `ERROR` | Handler threw, worker connection lost, reconnect failed |

## Disabling logging

```ts
new BeanstalkServer({ logger: false })
```

## Custom logger

Pass any object that implements NestJS's `LoggerService` interface:

```ts
import { LoggerService } from '@nestjs/common';

class MyLogger implements LoggerService {
  log(message: string)     { /* ... */ }
  error(message: string)   { /* ... */ }
  warn(message: string)    { /* ... */ }
  debug(message: string)   { /* ... */ }
  verbose(message: string) { /* ... */ }
  fatal(message: string)   { /* ... */ }
}

new BeanstalkServer({ logger: new MyLogger() })
```

### Winston example

```ts
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

const winstonLogger = WinstonModule.createLogger({
  transports: [new winston.transports.Console()],
});

new BeanstalkServer({ logger: winstonLogger })
```

### Pino example

```ts
import { Logger } from 'nestjs-pino';

// inside a NestJS app, inject the Pino logger
const pinoLogger = app.get(Logger);
new BeanstalkServer({ logger: pinoLogger })
```

## Application-level log level

You can control the NestJS log level globally. This also affects `BeanstalkServer` logs when using the default logger:

```ts
const app = await NestFactory.createMicroservice(AppModule, {
  strategy: new BeanstalkServer({ tube: 'orders' }),
  logger: ['log', 'warn', 'error'], // suppress debug and verbose
});
```
