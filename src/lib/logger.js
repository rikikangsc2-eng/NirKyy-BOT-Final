/*
 * Lokasi: src/lib/logger.js
 * Versi: v2
 */

import pino from 'pino';

const transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
        ignore: 'pid,hostname',
      },
      level: 'info'
    }
  ]
});

const logger = pino(transport);

export default logger;