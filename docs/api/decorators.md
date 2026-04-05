# Decorators

## `@BeanstalkPattern(pattern)`

A convenience alias for NestJS's built-in `@MessagePattern()`. Functionally identical — provided for clarity in Beanstalk-specific codebases.

```ts
import { BeanstalkPattern } from '@romysaputrasihanandaa/nestjs-beanstalk';

@Controller()
export class OrdersController {
  @BeanstalkPattern('order.created')
  async handleOrderCreated(@Payload() data: CreateOrderDto): Promise<void> {
    // ...
  }
}
```

Both decorators are interchangeable:

```ts
// These two are identical
@MessagePattern('order.created')
@BeanstalkPattern('order.created')
```

## Standard NestJS decorators

The following standard NestJS microservice decorators work as-is with this transport:

| Decorator | Import | Description |
|---|---|---|
| `@MessagePattern(pattern)` | `@nestjs/microservices` | Register a handler for the given pattern |
| `@Payload()` | `@nestjs/microservices` | Inject the job data |
| `@Ctx()` | `@nestjs/microservices` | Inject the `BeanstalkContext` |
