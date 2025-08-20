/*
 * Lokasi: src/commands/tools/sticker.js
 * Versi: v4
 */

import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';
import { getBotJid, getNumber } from '#lib/utils.js';

export default {
    name: 'sticker',
    aliases: ['s'],
    description: 'Mengubah gambar atau video menjadi stiker.',
    execute: async ({ sock, m, args }) => {
        let messageToProcess = m;
        const isQuoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (isQuoted) {
            const { quotedMessage, stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
            const botJid = getBotJid(sock);
            
            const reconstructedKey = {
                remoteJid: m.key.remoteJid,
                id: stanzaId,
                fromMe: getNumber(participant) === getNumber(botJid),
            };

            if (participant && typeof participant === 'string') {
                reconstructedKey.participant = participant;
            }

            messageToProcess = {
                key: reconstructedKey,
                message: quotedMessage,
            };
        }

        const messageContent = messageToProcess.message;
        const hasMedia = messageContent?.imageMessage || messageContent?.videoMessage;

        if (!hasMedia) {
            await sock.sendMessage(m.key.remoteJid, { text: 'Kirim gambar/video atau reply gambar/video dengan caption `.s` ya, bro!' }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { text: '*Sip, lagi bikin stiker...* ✂️' }, { quoted: m });

        try {
            const buffer = await downloadMediaMessage(
                messageToProcess,
                'buffer',
                {},
                { logger }
            );

            let packname = 'NirKyy Stickers';
            let author = 'NirKyy Dev';

            const argString = args.join(' ').trim();
            const parts = argString.split('|').map(s => s.trim());
            if (parts.length === 2) {
                packname = parts[0] || packname;
                author = parts[1] || author;
            } else if (parts.length === 1 && parts[0] !== '') {
                packname = parts[0];
            }

            const sticker = new Sticker(buffer, {
                pack: packname,
                author: author,
                type: StickerTypes.FULL,
                quality: 100
            });

            const stickerBuffer = await sticker.toBuffer();

            await sock.sendMessage(m.key.remoteJid, { sticker: stickerBuffer }, { quoted: m });
        } catch (error) {
            logger.error({ err: error }, 'Gagal bikin stiker');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal bikin stiker, bro. Coba lagi ya!' }, { quoted: m });
        }
    }
};