# Consumer

The consumer is a standard NestJS microservice. The only difference from other transports is the `strategy` option passed to `createMicroservice`.

## Bootstrap

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
      maxRetries: 3,
      retryDelay: 5,
    }),
  });

  await app.listen();
}
bootstrap();
```

## Registering handlers

Use the standard NestJS `@MessagePattern()` decorator. The pattern string must exactly match the `pattern` field in the job payload.

```ts
import { Controller } from '@nestjs/common';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import { BeanstalkContext } from '@romysaputrasihanandaa/nestjs-beanstalk';

@Controller()
export class OrdersController {
  @MessagePattern('order.created')
  async handleOrderCreated(
    @Payload() data: CreateOrderDto,
    @Ctx() ctx: BeanstalkContext,
  ): Promise<void> {
    console.log(`job #${ctx.getJobId()} on tube "${ctx.getTube()}"`, data);
  }

  @MessagePattern('order.cancelled')
  async handleOrderCancelled(
    @Payload() data: { id: number },
  ): Promise<void> {
    console.log('order cancelled', data.id);
  }
}
```

### `@BeanstalkPattern` alias

The package ships a convenience alias that is functionally identical to `@MessagePattern`:

```ts
import { BeanstalkPattern } from '@romysaputrasihanandaa/nestjs-beanstalk';

@Controller()
export class NotificationsController {
  @BeanstalkPattern('email.send')
  async handleEmail(@Payload() data: EmailDto): Promise<void> {
    // ...
  }
}
```

## Using the context

`BeanstalkContext` is injected via `@Ctx()` and exposes the Beanstalkd job metadata:

```ts
@MessagePattern('order.created')
async handle(
  @Payload() data: any,
  @Ctx() ctx: BeanstalkContext,
): Promise<void> {
  console.log('job id :', ctx.getJobId());
  console.log('tube   :', ctx.getTube());
}
```

See [BeanstalkContext →](../guide/context)

## Error handling & retry

If a handler throws an error, the transport automatically releases the job back to the queue after `retryDelay` seconds. After `maxRetries` releases the job is buried.

```ts
@MessagePattern('order.created')
async handle(@Payload() data: any): Promise<void> {
  // throwing here triggers the retry mechanism
  throw new Error('downstream service unavailable');
}
```

See [Retry & Bury →](../advanced/retry-bury) for the full flow.

## Module setup

Register your controllers in the module as usual:

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class AppModule {}
```
