/**
 * Producer example
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows how to use BeanstalkClient to push jobs from any Node.js / NestJS
 * context (HTTP handler, cron job, CLI script, etc.).
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register examples/producer.example.ts
 */

import 'reflect-metadata';

// In a real project:
//   import { BeanstalkClient } from '@romysaputrasihanandaa/nestjs-beanstalk';
import { BeanstalkClient } from '../src';

async function main() {
  const client = new BeanstalkClient({
    host: 'localhost',
    port: 11300,
    tube: 'orders',
    priority: 0,   // highest priority
    delay: 0,      // ready immediately
    ttr: 60,       // 60 s to process before auto-release
  });

  await client.connect();
  console.log('[Producer] Connected to Beanstalkd');

  // ── Emit a simple job ────────────────────────────────────────────────────

  const jobId1 = await client.emit('order.created', {
    id: 1001,
    product: 'Widget A',
    qty: 3,
  });
  console.log(`[Producer] Queued job ${jobId1} → order.created`);

  // ── Emit with per-call overrides ─────────────────────────────────────────

  const jobId2 = await client.emit(
    'order.created',
    { id: 1002, product: 'Widget B', qty: 1 },
    { priority: 10, delay: 5 }, // delayed 5 s
  );
  console.log(`[Producer] Queued job ${jobId2} → order.created (delayed 5 s)`);

  // ── Emit a cancellation ──────────────────────────────────────────────────

  const jobId3 = await client.emit('order.cancelled', { id: 1001 });
  console.log(`[Producer] Queued job ${jobId3} → order.cancelled`);

  // ── Switch tubes without reconnecting ────────────────────────────────────

  await client.useTube('notifications');
  const jobId4 = await client.emit('email.send', {
    to: 'user@example.com',
    subject: 'Your order is confirmed',
  });
  console.log(`[Producer] Queued job ${jobId4} → email.send (tube: notifications)`);

  // ── Bulk emit ────────────────────────────────────────────────────────────

  await client.useTube('orders');
  const bulk = Array.from({ length: 5 }, (_, i) => ({ id: 2000 + i, qty: 1 }));
  const jobIds = await Promise.all(
    bulk.map((order) => client.emit('order.created', order)),
  );
  console.log(`[Producer] Bulk queued ${jobIds.length} jobs:`, jobIds);

  client.disconnect();
  console.log('[Producer] Disconnected');
}

main().catch(console.error);
