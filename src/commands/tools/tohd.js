import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';
import { uploadToTmpFiles } from '#lib/uploader.js';

const UPSCALE_API_URL = 'https://api.sxtream.xyz/tools/upscale';
const UPSCALE_TIMEOUT = 150000;

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

            const upscaleFullUrl = `${UPSCALE_API_URL}?url=${encodeURIComponent(imageUrl)}`;
            const upscaleResponse = await axios.get(upscaleFullUrl, {
                responseType: 'arraybuffer',
                timeout: UPSCALE_TIMEOUT
            });

            await sock.sendMessage(m.key.remoteJid, {
                image: Buffer.from(upscaleResponse.data),
                caption: '*Taraa!* Gambarnya udah jadi HD! Makin jernih kan? 😎'
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error }, 'Error pada fitur .tohd');
            const errorMessage = `Waduh, ada masalah pas lagi proses gambarnya, bro.\n\n*Detail Error:* ${error.message || 'Server API tidak merespon atau terjadi timeout.'}\n\nMungkin servernya lagi sibuk atau gambarnya nggak didukung. Coba lagi beberapa saat ya.`;
            try {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage, edit: initialMessage.key });
            } catch (finalEditError) {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
            }
        }
    }
};