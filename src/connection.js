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
let isConnecting = false;
let retryCount = 0;
const MAX_RETRIES = 5;
const SESSION_CLEANUP_INTERVAL = 1000 * 60 * 60 * 24;
const SESSION_FILE_AGE_LIMIT = 1000 * 60 * 60 * 24 * 7;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function emergencySessionCleanup() {
    const sessionDir = path.join(process.cwd(), 'baileys_session');
    logger.warn(`Memulai pembersihan darurat pada direktori: ${sessionDir}`);
    try {
        const files = await fs.readdir(sessionDir);
        let filesDeleted = 0;
        const unlinkPromises = files.map(file => {
            if (file !== 'creds.json') {
                logger.info(`Menghapus file sesi untuk mengosongkan ruang: ${file}`);
                filesDeleted++;
                return fs.unlink(path.join(sessionDir, file));
            }
            return Promise.resolve();
        });
        await Promise.all(unlinkPromises);
        if (filesDeleted > 0) {
            logger.info(`Pembersihan darurat selesai: ${filesDeleted} file telah dihapus.`);
            return true;
        }
        logger.warn('Tidak ada file yang bisa dihapus saat pembersihan darurat.');
        return false;
    } catch (cleanupError) {
        logger.fatal({ err: cleanupError }, 'Gagal total saat membersihkan direktori sesi. Matikan bot secara manual.');
        return false;
    }
}

async function scheduleSessionCleanup() {
    const sessionDir = path.join(process.cwd(), 'baileys_session');
    try {
        const files = await fs.readdir(sessionDir);
        const now = Date.now();
        let filesDeleted = 0;
        for (const file of files) {
            if (file === 'creds.json') continue;
            const filePath = path.join(sessionDir, file);
            const stat = await fs.stat(filePath);
            if (now - stat.mtimeMs > SESSION_FILE_AGE_LIMIT) {
                await fs.unlink(filePath);
                filesDeleted++;
            }
        }
        if (filesDeleted > 0) {
            logger.info(`Pembersihan proaktif: ${filesDeleted} file sesi lama telah dihapus.`);
        }
    } catch (error) {
        logger.error({ err: error }, 'Gagal menjalankan pembersihan sesi proaktif.');
    }
}

async function connectToWhatsApp() {
    if (isConnecting || (sock && sock.ws.readyState === 1)) {
        logger.info('Koneksi sudah ada atau sedang diproses.');
        return;
    }
    isConnecting = true;

    const { state, saveCreds: originalSaveCreds } = await useMultiFileAuthState('baileys_session');
    
    const saveCreds = async () => {
        try {
            await originalSaveCreds();
        } catch (error) {
            if (error.code === 'ENOSPC') {
                logger.warn('Deteksi error ENOSPC (Disk/Inode Penuh) saat menyimpan kredensial sesi.');
                const cleanupSuccess = await emergencySessionCleanup();
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

    const baileysLogger = pino({ level: 'warn' });

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: baileysLogger,
        browser: Browsers.macOS('Chrome'),
        syncFullHistory: false,
        getMessage: async (key) => undefined
    });
    
    initializeHandler(sock);
    startTradingSimulator(sock);
    
    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        try {
            const phoneNumber = await question('Sesi tidak ditemukan. Masukkan nomor WhatsApp Bot Anda (contoh: 628xxxxxxxx): ');
            const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
            logger.info(`\n====================================`);
            logger.info(`   Kode Pairing Lu, Bro: ${code}`);
            logger.info(`====================================\n`);
        } catch (error) {
            logger.error("Gagal request pairing code:", error);
            rl.close();
            isConnecting = false;
            process.exit(1);
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            logger.info('Anjay, bot udah nyambung dan siap nge-gas!');
            isConnecting = false;
            retryCount = 0;
            if (rl) rl.close();
        } else if (connection === 'close') {
            isConnecting = false;
            
            const lastDisconnectError = lastDisconnect?.error;
            const shouldReconnect = (lastDisconnectError instanceof Boom) &&
                                    lastDisconnectError.output?.statusCode !== DisconnectReason.loggedOut;
            
            logger.error({ error: lastDisconnectError }, 'Koneksi terputus');

            if (shouldReconnect && retryCount < MAX_RETRIES) {
                retryCount++;
                const delay = Math.pow(2, retryCount) * 1000;
                logger.info(`Mencoba menyambung ulang dalam ${delay / 1000} detik (percobaan ke-${retryCount})...`);
                setTimeout(connectToWhatsApp, delay);
            } else if (shouldReconnect) {
                logger.fatal(`Gagal menyambung setelah ${MAX_RETRIES} percobaan. Bot berhenti.`);
                process.exit(1);
            } else {
                logger.warn('Koneksi putus permanen (Logged Out). Hapus folder "baileys_session" dan restart.');
                process.exit(1);
            }
        }
    });
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

export async function startBot() {
    await connectToWhatsApp();
    setInterval(scheduleSessionCleanup, SESSION_CLEANUP_INTERVAL);
    scheduleSessionCleanup();
}