/*
 * Lokasi: start.js
 * Versi: v4
 */

import dotenv from 'dotenv';
import logger from '#lib/logger.js';
import { startBot } from './src/connection.js';

dotenv.config();

process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled Rejection at promise.');
});

process.on('uncaughtException', (err, origin) => {
    logger.fatal({ err, origin }, 'Uncaught Exception thrown.');
});

async function main() {
    try {
        console.log("Mencoba menyalakan mesin bot...");
        await startBot();
    } catch (error) {
        logger.fatal(error, "Gagal total saat memulai bot:");
    }
}

main();