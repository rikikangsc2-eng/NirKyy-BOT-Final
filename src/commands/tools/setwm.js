import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';

export default {
    name: 'setwm',
    aliases: ['wm', 'watermark'],
    category: 'tools',
    description: 'Mengubah watermark (pack & author) dari stiker yang di-reply.',
    async execute({ sock, m, args }) {
        const isQuoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!isQuoted) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Reply dulu stiker yang mau diubah watermark-nya, bro.' }, { quoted: m });
        }

        const isSticker = isQuoted.stickerMessage;
        if (!isSticker) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Yang kamu reply bukan stiker, bro.' }, { quoted: m });
        }

        const text = args.join(' ');
        if (!text.includes('|')) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Formatnya salah. Pisahkan nama pack dan author dengan `|`.\n\nContoh: `.setwm Pack Keren|Author Ganteng`' }, { quoted: m });
        }

        const [packname, author] = text.split('|').map(s => s.trim());
        if (!packname) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Nama pack tidak boleh kosong, bro.' }, { quoted: m });
        }

        const { stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
        const messageToProcess = {
            key: {
                remoteJid: m.key.remoteJid,
                id: stanzaId,
                fromMe: participant === sock.user.id,
                participant,
            },
            message: isQuoted,
        };

        await sock.sendMessage(m.key.remoteJid, { text: '*Sip, lagi ganti watermark stiker...* ✍️' }, { quoted: m });

        try {
            const buffer = await downloadMediaMessage(
                messageToProcess,
                'buffer',
                {},
                { logger }
            );

            const sticker = new Sticker(buffer, {
                pack: packname,
                author: author || '',
                type: isSticker.isAnimated ? StickerTypes.FULL : StickerTypes.CROPPED,
                quality: 100
            });

            const stickerBuffer = await sticker.toBuffer();
            await sock.sendMessage(m.key.remoteJid, { sticker: stickerBuffer }, { quoted: m });

        } catch (error) {
            logger.error({ err: error }, 'Gagal membuat stiker dengan watermark baru');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal bikin stikernya, bro. Mungkin stikernya rusak atau ada error lain.' }, { quoted: m });
        }
    }
};