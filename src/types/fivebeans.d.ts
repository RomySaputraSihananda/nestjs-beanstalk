declare module 'fivebeans' {
  import { EventEmitter } from 'events';

  type BeanstalkError = string | Error | null;
  type BeanstalkCb<T extends unknown[] = []> = (
    err: BeanstalkError,
    ...args: T
  ) => void;

  class client extends EventEmitter {
    constructor(host: string, port: number);

    connect(): void;
    end(): void;
    quit(callback?: BeanstalkCb): void;

    use(tube: string, callback: BeanstalkCb<[string]>): void;
    watch(tube: string, callback: BeanstalkCb<[number]>): void;
    ignore(tube: string, callback: BeanstalkCb<[number]>): void;

    put(
      priority: number,
      delay: number,
      ttr: number,
      payload: string | Buffer,
      callback: BeanstalkCb<[number]>,
    ): void;

    reserve(callback: BeanstalkCb<[number, Buffer]>): void;
    reserve_with_timeout(
      seconds: number,
      callback: BeanstalkCb<[number, Buffer]>,
    ): void;

    destroy(jobId: number, callback: BeanstalkCb): void;
    release(
      jobId: number,
      priority: number,
      delay: number,
      callback: BeanstalkCb,
    ): void;
    bury(jobId: number, priority: number, callback: BeanstalkCb): void;
    touch(jobId: number, callback: BeanstalkCb): void;
    kick(bound: number, callback: BeanstalkCb<[number]>): void;
    kick_job(jobId: number, callback: BeanstalkCb): void;

    stats_job(
      jobId: number,
      callback: BeanstalkCb<[Record<string, string>]>,
    ): void;
    stats_tube(
      tube: string,
      callback: BeanstalkCb<[Record<string, string>]>,
    ): void;
    stats(callback: BeanstalkCb<[Record<string, string>]>): void;

    peek(jobId: number, callback: BeanstalkCb<[number, Buffer]>): void;
    peek_ready(callback: BeanstalkCb<[number, Buffer]>): void;
    peek_delayed(callback: BeanstalkCb<[number, Buffer]>): void;
    peek_buried(callback: BeanstalkCb<[number, Buffer]>): void;

    list_tubes(callback: BeanstalkCb<[string[]]>): void;
    list_tubes_watched(callback: BeanstalkCb<[string[]]>): void;
    list_tube_used(callback: BeanstalkCb<[string]>): void;
  }

  export { client };
}
