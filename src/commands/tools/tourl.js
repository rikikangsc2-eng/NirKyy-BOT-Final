import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';

const UPLOAD_API_URL = 'https://nirkyy-dev.hf.space/api/v1/toimgbb';

export default {
    name: 'tourl',
    aliases: ['upload'],
    category: 'tools',
    description: 'Mengubah media (gambar/video/stiker/audio) menjadi URL publik.',
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
        const mediaType = Object.keys(messageContent).find(key => 
            ['imageMessage', 'stickerMessage'].includes(key)
        );

        if (!mediaType) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Reply atau kirim gambar/stiker dengan caption `.tourl` ya, bro!' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi proses upload media... 🚀' }, { quoted: m });

        try {
            const buffer = await downloadMediaMessage(messageToProcess, 'buffer', {}, { logger });

            const uploadResponse = await axios.post(UPLOAD_API_URL, {
                file: { data: [...buffer] }
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
            });

            if (!uploadResponse.data?.success || !uploadResponse.data?.data?.url) {
                throw new Error('API uploader tidak memberikan URL yang valid atau gagal memproses.');
            }

            const publicUrl = uploadResponse.data.data.url;
            const successMessage = `✅ *Berhasil!* Ini link media lu:\n\n${publicUrl}`;
            await sock.sendMessage(m.key.remoteJid, { text: successMessage }, { quoted: m });

        } catch (error) {
            logger.error({ err: error }, 'Error pada fitur .tourl');
            const errorMessage = `Waduh, gagal upload medianya, bro.\n\n*Pesan Error:* ${error.message || 'Server API tidak merespon.'}`;
            await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
        }
    }
};