/*
* Lokasi: src/commands/tools/tohd.js
* Versi: v2
*/

import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';
import { uploadToTmpFiles } from '#lib/uploader.js';

const API_TOKEN = 'sk-paxsenix-ImdMKbWzB6ztCfdbLn_1bYiNONyIKs2ZS-M6nELU9mEYe_Qb';
const API_URL = 'https://api.paxsenix.biz.id/ai-tools/upscale';
const POLLING_INTERVAL = 10000;
const POLLING_TIMEOUT = 180000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function pollTask(taskUrl) {
    const startTime = Date.now();
    while (Date.now() - startTime < POLLING_TIMEOUT) {
        try {
            const { data } = await axios.get(taskUrl, { headers: { 'Authorization': `Bearer ${API_TOKEN}` } });
            if (data.status === 'done') return data.url;
            if (data.status === 'failed') throw new Error(data.message || 'Proses upscale gagal di server AI.');
            await delay(POLLING_INTERVAL);
        } catch (error) {
            throw new Error('Gagal memeriksa status tugas upscale.');
        }
    }
    throw new Error('Batas waktu proses upscale terlampaui.');
}

export default {
    name: 'tohd',
    aliases: ['hd'],
    category: 'tools',
    description: 'Meningkatkan resolusi dan kualitas gambar menjadi lebih jernih (HD).',

    async execute({ sock, m }) {
        let messageToProcess = m;
        const isQuoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (isQuoted) {
            const { quotedMessage, stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
            messageToProcess = {
                key: {
                    remoteJid: m.key.remoteJid,
                    id: stanzaId,
                    fromMe: participant === sock.user.id,
                    participant: participant,
                },
                message: quotedMessage,
            };
        }

        const messageContent = messageToProcess.message;
        const hasMedia = messageContent?.imageMessage;

        if (!hasMedia) {
            return await sock.sendMessage(m.key.remoteJid, {
                text: 'Kirim gambar atau reply gambar dengan caption `.hd` untuk meningkatkan kualitasnya, bro! ✨'
            }, { quoted: m });
        }

        const initialMessage = await sock.sendMessage(m.key.remoteJid, { text: '*Sip, lagi nyiapin gambar buat di-upgrade...* ⚙️' }, { quoted: m });

        try {
            const buffer = await downloadMediaMessage(messageToProcess, 'buffer', {}, { logger });
            const imageUrl = await uploadToTmpFiles(buffer, 'image-for-hd.jpg');

            await sock.sendMessage(m.key.remoteJid, {
                text: '*Gambar berhasil di-upload, sekarang proses upscale jadi HD...* 🧠✨\n\nIni bisa makan waktu agak lama, sabar yaa~',
                edit: initialMessage.key
            });

            const upscaleInitialUrl = `${API_URL}?url=${encodeURIComponent(imageUrl)}&scale=2`;
            const { data: initialResponse } = await axios.get(upscaleInitialUrl, {
                headers: { 'Authorization': `Bearer ${API_TOKEN}` },
                timeout: 30000
            });

            if (!initialResponse.ok || !initialResponse.task_url) {
                throw new Error(initialResponse.message || 'API upscale tidak memberikan URL tugas.');
            }

            const finalImageUrl = await pollTask(initialResponse.task_url);
            
            if (!finalImageUrl) {
                 throw new Error('Gagal mendapatkan URL gambar final setelah polling selesai.');
            }

            const upscaleResponse = await axios.get(finalImageUrl, {
                responseType: 'arraybuffer'
            });

            await sock.sendMessage(m.key.remoteJid, {
                image: Buffer.from(upscaleResponse.data),
                caption: '*Taraa!* Gambarnya udah jadi HD! Makin jernih kan? 😎'
            }, { quoted: m });
            
            await sock.sendMessage(m.key.remoteJid, { delete: initialMessage.key });

        } catch (error) {
            logger.error({ err: error, data: error?.response?.data }, 'Error pada fitur .tohd');
            const errorMessage = `Waduh, ada masalah pas lagi proses gambarnya, bro.\n\n*Detail Error:* ${error.message || 'Server API tidak merespon atau terjadi timeout.'}`;
            try {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage, edit: initialMessage.key });
            } catch (finalEditError) {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
            }
        }
    }
};