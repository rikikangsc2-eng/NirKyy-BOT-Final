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
    },
    {
      target: 'pino/file',
      options: {
        destination: './crash.log',
        mkdir: true
      },
      level: 'warn'
    }
  ]
});

const logger = pino(transport);

export default logger;