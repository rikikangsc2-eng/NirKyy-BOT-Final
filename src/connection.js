/*
* Lokasi: src/connection.js
* Versi: v2
*/

import fs from 'fs';
import path from 'path';
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
import { handleMessageUpsert } from '#events/messageUpsert.js';
import { handleGroupParticipantsUpdate } from '#events/groupUpdate.js';

export const groupMetadataCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 5 });
const messageStore = new LRUCache({ max: 200 });
const messageStorePath = path.resolve(process.cwd(), 'baileys_message_store.json');
let isStoreDirty = false;

let sock;
let rl;
let keepAliveTimeoutId = null;
const MIN_KEEP_ALIVE_INTERVAL = 240 * 1000;
const MAX_KEEP_ALIVE_INTERVAL = 300 * 1000;

const saveStore = async () => {
    try {
        const data = JSON.stringify(Array.from(messageStore.entries()));
        await fs.promises.writeFile(messageStorePath, data, 'utf-8');
        logger.info('Message store berhasil disimpan ke file.');
    } catch (error) {
        logger.error({ err: error }, 'Gagal menyimpan message store ke file.');
    }
};

const loadStore = () => {
    try {
        const data = fs.readFileSync(messageStorePath, 'utf-8');
        if (data) {
            const entries = JSON.parse(data);
            for (const [key, value] of entries) {
                messageStore.set(key, value);
            }
            logger.info(`Berhasil memuat ${messageStore.size} pesan dari store.`);
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            logger.warn({ err: error }, 'Gagal membaca message store, memulai dengan cache kosong.');
        } else {
            logger.info('File message store tidak ditemukan, memulai dengan cache kosong.');
        }
    }
};

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

function scheduleKeepAlive(sock) {
    if (keepAliveTimeoutId) clearTimeout(keepAliveTimeoutId);

    const randomInterval = Math.floor(Math.random() * (MAX_KEEP_ALIVE_INTERVAL - MIN_KEEP_ALIVE_INTERVAL + 1)) + MIN_KEEP_ALIVE_INTERVAL;
    
    keepAliveTimeoutId = setTimeout(async () => {
        if (sock && sock.ws.isOpen) {
            await sock.sendPresenceUpdate('available');
            logger.info(`Ping keep-alive terkirim. Jadwal berikutnya dalam ~${(randomInterval / 1000).toFixed(0)} detik.`);
            scheduleKeepAlive(sock);
        } else {
            logger.warn('Koneksi WebSocket tertutup, ping keep-alive dilewati.');
        }
    }, randomInterval);
}

async function connectToWhatsApp() {
    loadStore();
    setInterval(() => {
        if (isStoreDirty) {
            saveStore();
            isStoreDirty = false;
        }
    }, 10_000);

    const { state, saveCreds: originalSaveCreds } = await useMultiFileAuthState('baileys_session');
    
    const saveCreds = async () => {
        try {
            await originalSaveCreds();
        } catch (error) {
            if (error.code === 'ENOSPC') {
                logger.warn('Deteksi error ENOSPC (Disk/Inode Penuh) saat menyimpan kredensial.');
                logger.fatal('Sesi tidak dapat disimpan. Matikan bot, jalankan .clearsesi, lalu restart oleh PM2.');
                process.exit(1);
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
        getMessage: async (key) => {
            const stored = messageStore.get(key.id);
            return stored ? stored.message : undefined;
        }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
        for (const msg of messages) {
            if (msg.key?.id) {
                messageStore.set(msg.key.id, msg);
                isStoreDirty = true;
            }
        }
        handleMessageUpsert(sock, { messages, type });
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
    sock.ev.on('connection.update', (update) => handleConnectionUpdate(update));

    sock.ev.on('group-participants.update', (event) => handleGroupParticipantsUpdate(sock, event));
    
    startTradingSimulator(sock);
}

async function handleConnectionUpdate(update) {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
        logger.info('Bot nyambung, siap gaspol!');
        closeRl();
        await sock.sendPresenceUpdate('available');
        scheduleKeepAlive(sock);
    } else if (connection === 'close') {
        if (keepAliveTimeoutId) clearTimeout(keepAliveTimeoutId);
        const lastDisconnectError = lastDisconnect?.error;
        const shouldReconnect = (lastDisconnectError instanceof Boom) && lastDisconnectError.output?.statusCode !== DisconnectReason.loggedOut;
        
        logger.error({ error: lastDisconnectError }, 'Koneksi terputus');

        if (shouldReconnect) {
            logger.fatal(`Koneksi terputus. Bot akan dimatikan. PM2 akan melakukan restart.`);
            process.exit(1);
        } else {
            logger.warn('Koneksi putus permanen (Logged Out). Hapus folder "baileys_session" dan restart.');
            closeRl();
            process.exit(1);
        }
    }
}

async function gracefulShutdown() {
    logger.info('Menerima sinyal shutdown, mematikan bot...');
    if (keepAliveTimeoutId) clearTimeout(keepAliveTimeoutId);
    if (isStoreDirty) await saveStore();
    if (sock) await sock.end(new Error('Graceful Shutdown'));
    if (db) db.close();
    logger.info('Koneksi database ditutup.');
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { connectToWhatsApp as startBot };