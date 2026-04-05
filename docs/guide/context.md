# Context

`BeanstalkContext` carries Beanstalkd-specific metadata for each job. It is injected into handlers via the `@Ctx()` decorator.

## Injection

```ts
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import { BeanstalkContext } from '@romysaputrasihanandaa/nestjs-beanstalk';

@MessagePattern('order.created')
async handle(
  @Payload() data: any,
  @Ctx() ctx: BeanstalkContext,
): Promise<void> {
  console.log(ctx.getJobId()); // e.g. 42
  console.log(ctx.getTube());  // e.g. 'orders'
}
```

## Methods

### `getJobId(): number`

Returns the Beanstalkd job ID assigned when the job was put into the queue.

```ts
const id = ctx.getJobId(); // 42
```

### `getTube(): string`

Returns the name of the tube the job was reserved from. This always matches the `tube` option passed to `BeanstalkServer`.

```ts
const tube = ctx.getTube(); // 'orders'
```

### `getArgs(): [number, string]`

Returns the raw context arguments tuple `[jobId, tube]`. Inherited from `BaseRpcContext`.

```ts
const [jobId, tube] = ctx.getArgs();
```

### `getArgByIndex(index: number): any`

Returns a single context argument by index.

```ts
ctx.getArgByIndex(0); // jobId
ctx.getArgByIndex(1); // tube
```

## Inheritance

`BeanstalkContext` extends NestJS's `BaseRpcContext`, so it works with any NestJS guard, interceptor, or pipe that accepts `ExecutionContext` in a microservice context.

```ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { BeanstalkContext } from '@romysaputrasihanandaa/nestjs-beanstalk';

@Injectable()
export class TubeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = context.switchToRpc().getContext<BeanstalkContext>();
    return ctx.getTube() === 'orders';
  }
}
```
