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
import { promises as fs } from 'fs';
import path from 'path';
import logger from '#lib/logger.js';
import config from '#config';
import db from '#database';
import { initializeHandler } from '#handler';
import { start as startTradingSimulator } from '#lib/tradingSimulator.js';

export const groupMetadataCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 5 });

let sock;
let rl;
let retryCount = 0;
const MAX_RETRIES = 5;
const DAILY_CLEANUP_INTERVAL = 1000 * 60 * 60 * 24;

const question = (text) => new Promise((resolve) => {
    if (!rl || rl.closed) {
        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }
    rl.question(text, resolve);
});

const closeRl = () => {
    if (rl && !rl.closed) {
        rl.close();
        rl = null;
    }
};

async function performSessionCleanup(reason = 'berkala') {
    const sessionDir = path.join(process.cwd(), 'baileys_session');
    logger.warn(`Memulai pembersihan sesi (${reason}) pada direktori: ${sessionDir}`);
    try {
        const files = await fs.readdir(sessionDir);
        let filesDeleted = 0;
        const unlinkPromises = files.map(file => {
            if (file !== 'creds.json') {
                filesDeleted++;
                return fs.unlink(path.join(sessionDir, file));
            }
            return Promise.resolve();
        });
        await Promise.all(unlinkPromises);
        if (filesDeleted > 0) {
            logger.info(`Pembersihan sesi selesai: ${filesDeleted} file telah dihapus.`);
            return true;
        }
        logger.warn('Tidak ada file sesi yang perlu dihapus.');
        return false;
    } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
            logger.fatal({ err: cleanupError }, 'Gagal total saat membersihkan direktori sesi. Matikan bot secara manual.');
        }
        return false;
    }
}

async function handleConnectionUpdate(update) {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
        logger.info('Anjay, bot udah nyambung dan siap nge-gas!');
        retryCount = 0;
        closeRl();
    } else if (connection === 'close') {
        const lastDisconnectError = lastDisconnect?.error;
        const shouldReconnect = (lastDisconnectError instanceof Boom) &&
                                lastDisconnectError.output?.statusCode !== DisconnectReason.loggedOut;
        
        logger.error({ error: lastDisconnectError }, 'Koneksi terputus');

        if (shouldReconnect) {
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                const delay = Math.pow(2, retryCount) * 1000;
                logger.info(`Mencoba menyambung ulang dalam ${delay / 1000} detik (percobaan ke-${retryCount})...`);
                setTimeout(startBot, delay);
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

async function startBot() {
    await performSessionCleanup('startup');
    setInterval(() => performSessionCleanup('harian'), DAILY_CLEANUP_INTERVAL);
    
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
                    try {
                        await originalSaveCreds();
                        logger.info('Berhasil menyimpan kredensial setelah pembersihan darurat.');
                    } catch (retryError) {
                        logger.fatal({ err: retryError }, 'Gagal menyimpan kredensial bahkan setelah pembersihan. Bot berhenti.');
                        process.exit(1);
                    }
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

    const baileysLogger = pino({ level: 'silent' });

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: baileysLogger,
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
    sock.ev.on('connection.update', handleConnectionUpdate);
    
    initializeHandler(sock);
    startTradingSimulator(sock);
}

async function gracefulShutdown() {
    logger.info('Menerima sinyal shutdown, mematikan bot dengan benar...');
    if (sock) {
        await sock.end(new Error('Graceful Shutdown'));
    }
    if (db) {
        db.close();
        logger.info('Koneksi database ditutup.');
    }
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { startBot };