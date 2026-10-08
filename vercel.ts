import type { VercelConfig } from '@vercel/config/v1';

const config: VercelConfig = {
  framework: 'nextjs',
  regions: ['fra1'],
  buildCommand: 'npm run build',
  functions: {
    'src/app/api/queues/automation/route.ts': {
      maxDuration: 300,
      experimentalTriggers: [
        { type: 'queue/v2beta', topic: 'datamine-automation', maxConcurrency: 1 },
      ],
    },
  },
  crons: [{ path: '/api/cron/automation', schedule: '0 4 * * *' }],
};

export default config;
