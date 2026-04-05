import { BaseRpcContext } from '@nestjs/microservices';

type BeanstalkContextArgs = [jobId: number, tube: string];

/**
 * Execution context passed as the second argument to every handler.
 *
 * @example
 * ```ts
 * @MessagePattern('order.created')
 * async handle(@Payload() data: any, @Ctx() ctx: BeanstalkContext) {
 *   console.log(ctx.getJobId(), ctx.getTube());
 * }
 * ```
 */
export class BeanstalkContext extends BaseRpcContext<BeanstalkContextArgs> {
  constructor(args: BeanstalkContextArgs) {
    super(args);
  }

  /** Beanstalkd job ID */
  getJobId(): number {
    return this.args[0];
  }

  /** Name of the tube this job was reserved from */
  getTube(): string {
    return this.args[1];
  }
}
