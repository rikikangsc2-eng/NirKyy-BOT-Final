/*
* Lokasi: src/commands/tools/toimg.js
* Versi: v6
*/

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';

export default {
    name: 'toimg',
    aliases: ['toimage', 'tomedia'],
    category: 'tools',
    description: 'Mengubah stiker menjadi gambar.',
    async execute({ sock, m }) {
        const contextInfo = m.message?.extendedTextMessage?.contextInfo;
        const quotedMessage = contextInfo?.quotedMessage;

        if (!quotedMessage || !quotedMessage.stickerMessage) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah ini hanya berfungsi jika kamu membalas (reply) sebuah stiker.' }, { quoted: m });
        }
        
        if (quotedMessage.stickerMessage.isAnimated) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, stiker animasi belum bisa diubah jadi gambar, bro.' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi proses ngubah stiker jadi media...' }, { quoted: m });

        try {
            const stickerMessageToProcess = {
                key: {
                    remoteJid: m.key.remoteJid,
                    id: contextInfo.stanzaId,
                    participant: contextInfo.participant,
                },
                message: quotedMessage,
            };

            const buffer = await downloadMediaMessage(stickerMessageToProcess, 'buffer', {});

            await sock.sendMessage(m.key.remoteJid, {
                image: buffer,
                caption: 'Nih, stikernya udah jadi foto!'
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error }, 'Gagal mengubah stiker menjadi media');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal ngubah stikernya, bro. Mungkin stikernya rusak atau ada masalah lain.' }, { quoted: m });
        }
    }
};