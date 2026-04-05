import { MessagePattern } from '@nestjs/microservices';

/**
 * Convenience alias for @MessagePattern() — use it to declare a
 * Beanstalkd message handler.  Functionally identical to the NestJS
 * built-in; provided for explicitness in Beanstalk-specific codebases.
 *
 * @example
 * ```ts
 * @BeanstalkPattern('order.created')
 * async handleOrderCreated(@Payload() data: CreateOrderDto) { ... }
 * ```
 */
export const BeanstalkPattern = (pattern: string): MethodDecorator =>
  MessagePattern(pattern);
