export interface BeanstalkMessage<T = unknown> {
  /** Routing pattern — matched against @MessagePattern() decorators */
  pattern: string;
  /** Arbitrary job payload */
  data: T;
}
