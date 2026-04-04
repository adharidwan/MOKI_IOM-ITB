import 'server-only';

import { Queue } from 'bullmq';

import {
  OUTBOUND_DISPATCH_QUEUE_NAME,
  type OutboundDispatchJobData,
} from './outbound-dispatch-job';
import { getRedisClient } from './redis-server';

let outboundDispatchQueue: Queue<OutboundDispatchJobData> | null = null;

export function getOutboundDispatchQueue(): Queue<OutboundDispatchJobData> {
  if (!outboundDispatchQueue) {
    outboundDispatchQueue = new Queue<OutboundDispatchJobData>(OUTBOUND_DISPATCH_QUEUE_NAME, {
      connection: getRedisClient(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  }

  return outboundDispatchQueue;
}

export async function enqueueOutboundDispatchJob(
  jobData: OutboundDispatchJobData,
): Promise<void> {
  await getOutboundDispatchQueue().add('dispatch', jobData, {
    jobId: jobData.source_id,
    priority: jobData.priority,
    removeOnComplete: true,
    removeOnFail: true,
  });
}
