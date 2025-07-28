import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';
import { uploadToCatbox } from '#lib/uploader.js';

export default {
    name: 'tourl',
    aliases: ['upload'],
    category: 'tools',
    description: 'Mengubah media (gambar/video/stiker/audio) menjadi URL publik (permanen).',
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
            ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage'].includes(key)
        );

        if (!mediaType) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Reply atau kirim media dengan caption `.tourl` ya, bro!' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi proses upload media ke penyimpanan permanen... 🚀' }, { quoted: m });

        try {
            const buffer = await downloadMediaMessage(messageToProcess, 'buffer', {}, { logger });
            
            let extension;
            switch (mediaType) {
                case 'imageMessage':
                    extension = 'jpg';
                    break;
                case 'videoMessage':
                    extension = 'mp4';
                    break;
                case 'stickerMessage':
                    extension = 'webp';
                    break;
                case 'audioMessage':
                    extension = 'mp3';
                    break;
                default:
                    extension = 'bin';
            }

            const filename = `upload-${Date.now()}.${extension}`;
            const publicUrl = await uploadToCatbox(buffer, filename);
            
            const successMessage = `✅ *Berhasil!* Ini link media lu:\n\n${publicUrl}`;
            await sock.sendMessage(m.key.remoteJid, { text: successMessage }, { quoted: m });

        } catch (error) {
            logger.error({ err: error }, 'Error pada fitur .tourl');
            const errorMessage = `Waduh, gagal upload medianya, bro.\n\n*Pesan Error:* ${error.message || 'Server API tidak merespon.'}`;
            await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
        }
    }
};