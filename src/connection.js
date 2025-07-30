/*
* Lokasi: src/connection.js
* Versi: v2
*/

import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import readline from 'readline';
import pino from 'pino';
import { LRUCache } from 'lru-cache';
import logger from '#lib/logger.js';
import db from '#database';
import { start as startTradingSimulator } from '#lib/tradingSimulator.js';
import { performSessionCleanup, setupDailyCleanup, setupGameSessionCleanup } from '#lib/sessionManager.js';
import { handleMessageUpsert } from '#events/messageUpsert.js';
import { handleGroupParticipantsUpdate } from '#events/groupUpdate.js';

export const groupMetadataCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 5 });

let sock;
let rl;
let retryCount = 0;
const MAX_RETRIES = 5;

const question = (text) => new Promise((resolve) => {
    if (!rl || rl.closed) {
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }
    rl.question(text, resolve);
});

const closeRl = () => {
    if (rl && !rl.closed) {
        rl.close();
        rl = null;
    }
};

async function connectToWhatsApp() {
    await performSessionCleanup('startup');
    setupDailyCleanup();
    
    const { state, saveCreds: originalSaveCreds } = await useMultiFileAuthState('baileys_session');
    
    const saveCreds = async () => {
        try {
            await originalSaveCreds();
        } catch (error) {
            if (error.code === 'ENOSPC') {
                logger.warn('Deteksi error ENOSPC (Disk/Inode Penuh) saat menyimpan kredensial sesi.');
                const cleanupSuccess = await performSessionCleanup('darurat');
                if (cleanupSuccess) {
                    logger.info('Mencoba menyimpan kredensial kembali setelah pembersihan...');
                    await originalSaveCreds().catch(retryError => {
                        logger.fatal({ err: retryError }, 'Gagal menyimpan kredensial bahkan setelah pembersihan. Bot berhenti.');
                        process.exit(1);
                    });
                } else {
                    logger.fatal('Pembersihan darurat gagal. Bot berhenti.');
                    process.exit(1);
                }
            } else {
                logger.error({ err: error }, 'Gagal menyimpan kredensial.');
            }
        }
    };

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Menggunakan Baileys versi: ${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Chrome'),
        syncFullHistory: false,
        getMessage: async (key) => undefined
    });
    
    if (!sock.authState.creds.registered) {
        try {
            const phoneNumber = await question('Sesi tidak ditemukan. Masukkan nomor WhatsApp Bot Anda (contoh: 628xxxxxxxx): ');
            const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
            logger.info(`\n====================================`);
            logger.info(`   Kode Pairing Lu, Bro: ${code}`);
            logger.info(`====================================\n`);
        } catch (error) {
            logger.error("Gagal request pairing code:", error);
            closeRl();
            process.exit(1);
        }
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => handleConnectionUpdate(update, connectToWhatsApp));
    
    handleMessageUpsert(sock);
    sock.ev.on('group-participants.update', (event) => handleGroupParticipantsUpdate(sock, event));
    
    setupGameSessionCleanup(sock);
    startTradingSimulator(sock);
}

async function handleConnectionUpdate(update, reconnectFn) {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
        logger.info('Anjay, bot udah nyambung dan siap nge-gas!');
        retryCount = 0;
        closeRl();
    } else if (connection === 'close') {
        const lastDisconnectError = lastDisconnect?.error;
        const shouldReconnect = (lastDisconnectError instanceof Boom) && lastDisconnectError.output?.statusCode !== DisconnectReason.loggedOut;
        
        logger.error({ error: lastDisconnectError }, 'Koneksi terputus');

        if (shouldReconnect) {
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                const delay = Math.pow(2, retryCount) * 1000;
                logger.info(`Mencoba menyambung ulang dalam ${delay / 1000} detik (percobaan ke-${retryCount})...`);
                setTimeout(reconnectFn, delay);
            } else {
                logger.fatal(`Gagal menyambung setelah ${MAX_RETRIES} percobaan. Bot berhenti.`);
                process.exit(1);
            }
        } else {
            logger.warn('Koneksi putus permanen (Logged Out). Hapus folder "baileys_session" dan restart.');
            closeRl();
            process.exit(1);
        }
    }
}

async function gracefulShutdown() {
    logger.info('Menerima sinyal shutdown, mematikan bot dengan benar...');
    if (sock) await sock.end(new Error('Graceful Shutdown'));
    if (db) db.close();
    logger.info('Koneksi database ditutup.');
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { connectToWhatsApp as startBot };