/**
 * Consumer example
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows how to wire BeanstalkServer as a NestJS microservice transport and
 * handle jobs with the standard @MessagePattern / @Payload / @Ctx decorators.
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register examples/consumer.example.ts
 */

import 'reflect-metadata';
import { Controller, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';

// Re-export shim – in a real project you'd import from the package:
//   import { BeanstalkServer, BeanstalkContext, BeanstalkPattern } from '@romysaputrasihanandaa/nestjs-beanstalk';
import { BeanstalkContext, BeanstalkPattern, BeanstalkServer } from '../src';

// ─── Handler ────────────────────────────────────────────────────────────────

interface CreateOrderDto {
  id: number;
  product: string;
  qty: number;
}

@Controller()
class OrdersController {
  /**
   * Standard NestJS @MessagePattern works out-of-the-box.
   */
  @MessagePattern('order.created')
  async handleOrderCreated(
    @Payload() data: CreateOrderDto,
    @Ctx() ctx: BeanstalkContext,
  ): Promise<void> {
    console.log(
      `[Consumer] job=${ctx.getJobId()} tube=${ctx.getTube()} data=`,
      data,
    );
    // Simulate async work
    await new Promise((r) => setTimeout(r, 100));
    console.log(`[Consumer] job ${ctx.getJobId()} processed`);
  }

  /**
   * Using the optional @BeanstalkPattern alias — identical to @MessagePattern.
   */
  @BeanstalkPattern('order.cancelled')
  async handleOrderCancelled(
    @Payload() data: { id: number },
    @Ctx() ctx: BeanstalkContext,
  ): Promise<void> {
    console.log(`[Consumer] order ${data.id} cancelled (job ${ctx.getJobId()})`);
  }

  /**
   * This handler intentionally throws to demonstrate the retry mechanism.
   * On the first two attempts it throws; the third succeeds.
   */
  @MessagePattern('order.flaky')
  async handleFlaky(
    @Payload() data: { attempt: number },
    @Ctx() ctx: BeanstalkContext,
  ): Promise<void> {
    // ctx.getJobId() lets us inspect releases via Beanstalkd stats separately
    console.log(`[Consumer] flaky handler for job ${ctx.getJobId()}, data:`, data);
    throw new Error('simulated failure — will be retried');
  }
}

// ─── Module ─────────────────────────────────────────────────────────────────

@Module({ controllers: [OrdersController] })
class AppModule {}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

async function bootstrap() {
  const app = await NestFactory.createMicroservice(AppModule, {
    strategy: new BeanstalkServer({
      host: 'localhost',
      port: 11300,
      tube: 'orders',
      concurrency: 3,       // 3 concurrent workers
      autoAck: true,        // delete job on success
      maxRetries: 3,        // bury after 3 failed attempts
      retryDelay: 10,       // 10-second back-off between retries
      reconnectDelay: 3000, // 3 s before reconnect attempt
      logger: true,
    }),
  });

  await app.listen();
  console.log('[Consumer] Beanstalk microservice is listening');
}

bootstrap().catch(console.error);
