# BeanstalkContext

Execution context injected into handlers via `@Ctx()`. Extends `BaseRpcContext`.

## Methods

| Method | Returns | Description |
|---|---|---|
| `getJobId()` | `number` | Beanstalkd job ID |
| `getTube()` | `string` | Tube the job was reserved from |
| `getArgs()` | `[number, string]` | Raw `[jobId, tube]` tuple |
| `getArgByIndex(index)` | `any` | Single arg by index (0 = jobId, 1 = tube) |

## Example

```ts
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import { BeanstalkContext } from '@romysaputrasihanandaa/nestjs-beanstalk';

@MessagePattern('order.created')
async handle(
  @Payload() data: any,
  @Ctx() ctx: BeanstalkContext,
): Promise<void> {
  console.log(ctx.getJobId()); // 42
  console.log(ctx.getTube());  // 'orders'
}
```
