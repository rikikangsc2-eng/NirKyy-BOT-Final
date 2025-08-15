/*
* Lokasi: src/commands/ai/ai.js
* Versi: v4
*/

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { handleAiInteraction } from '#lib/aiHelper.js';
import { getBotJid } from '#lib/utils.js';

export default {
    name: 'ai',
    category: 'ai',
    description: 'Ngobrol sama Alicia, AI tsundere yang siap bantu kamu. Bisa juga dengan mengirim atau me-reply gambar.',
    execute: async ({ sock, m, args }) => {
        let messageToProcess = m;
        let text = args.join(' ');
        const isQuoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (isQuoted && !m.message.imageMessage) {
            const { quotedMessage, stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
            if (quotedMessage.imageMessage) {
                const botJid = getBotJid(sock);
                messageToProcess = {
                    key: {
                        remoteJid: m.key.remoteJid,
                        id: stanzaId,
                        fromMe: participant === botJid,
                        participant: participant
                    },
                    message: quotedMessage
                };
                if (!text) {
                    text = quotedMessage.imageMessage.caption || '';
                }
            }
        }
        
        if (!text) {
            text = m.message?.imageMessage?.caption || '';
        }

        const hasImage = messageToProcess.message?.imageMessage;

        if (!text && !hasImage) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Dih, mau nanya apa? Kirim teks atau gambar dong 🙄. Contoh: `.ai halo`' }, { quoted: m });
        }
        
        let imageBuffer = null;
        if (hasImage) {
            try {
                imageBuffer = await downloadMediaMessage(messageToProcess, 'buffer', {});
            } catch (error) {
                return await sock.sendMessage(m.key.remoteJid, { text: 'Gagal download gambar, coba lagi deh.' }, { quoted: m });
            }
        }
        
        await handleAiInteraction({ sock, m, text, imageBuffer });
    }
};