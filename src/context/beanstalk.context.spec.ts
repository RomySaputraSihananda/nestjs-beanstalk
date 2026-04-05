import { BeanstalkContext } from './beanstalk.context';

describe('BeanstalkContext', () => {
  let ctx: BeanstalkContext;

  beforeEach(() => {
    ctx = new BeanstalkContext([42, 'orders']);
  });

  it('getJobId() returns the job ID', () => {
    expect(ctx.getJobId()).toBe(42);
  });

  it('getTube() returns the tube name', () => {
    expect(ctx.getTube()).toBe('orders');
  });

  it('getArgs() returns the full args tuple', () => {
    expect(ctx.getArgs()).toEqual([42, 'orders']);
  });

  it('getArgByIndex(0) returns job ID', () => {
    expect(ctx.getArgByIndex(0)).toBe(42);
  });

  it('getArgByIndex(1) returns tube', () => {
    expect(ctx.getArgByIndex(1)).toBe('orders');
  });
});
