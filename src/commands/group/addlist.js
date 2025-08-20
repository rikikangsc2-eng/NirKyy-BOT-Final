/*
 * Lokasi: src/commands/group/addlist.js
 * Versi: v7
 */

import { statements } from '#database';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { uploadToCatbox } from '#lib/uploader.js';
import logger from '#lib/logger.js';
import { getParticipantInfo, getBotJid, getNumber } from '#lib/utils.js';

export default {
    name: 'addlist',
    description: 'Menambah atau memperbarui item dalam daftar kustom grup. Wajib reply. Admin only.',
    category: 'group',
    execute: async ({ sock, m, args }) => {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: 'Perintah ini hanya bisa digunakan di dalam grup.' }, { quoted: m });
        }

        const sender = await getParticipantInfo(sock, groupId, m.sender);
        if (!sender || (sender.admin !== 'admin' && sender.admin !== 'superadmin')) {
            return sock.sendMessage(groupId, { text: 'Hanya admin yang dapat menggunakan perintah ini.' }, { quoted: m });
        }
        
        const isQuoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const hasMediaInCommand = !!(m.message.imageMessage || m.message.videoMessage || m.message.stickerMessage || m.message.audioMessage);
        
        if (!isQuoted && !hasMediaInCommand) {
             return sock.sendMessage(groupId, { text: 'Format salah. Anda harus me-reply pesan atau mengirim media dengan caption `.addlist <kunci>`.' }, { quoted: m });
        }

        const key = args.join(' ').toLowerCase();
        if (!key) {
            return sock.sendMessage(groupId, { text: 'Kunci list tidak boleh kosong.\n\nContoh: Reply sebuah pesan dengan `.addlist info server`' }, { quoted: m });
        }

        let value;
        let messageToProcess = m;
        let mediaContent = m.message;
        
        if (isQuoted) {
            const { quotedMessage, stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
            const botJid = getBotJid(sock);
            mediaContent = quotedMessage;
            messageToProcess = {
                key: {
                    remoteJid: m.key.remoteJid,
                    id: stanzaId,
                    fromMe: getNumber(participant) === getNumber(botJid),
                    participant: participant,
                },
                message: mediaContent
            };
        }

        const mediaType = Object.keys(mediaContent || {}).find(k => k.endsWith('Message') && k !== 'senderKeyDistributionMessage' && !k.startsWith('extended'));
        const hasMedia = !!mediaType;

        if (hasMedia) {
            await sock.sendMessage(groupId, { text: `Menyimpan media untuk list *${key}*... ⏳` }, { quoted: m });
            try {
                const buffer = await downloadMediaMessage(messageToProcess, 'buffer', {});
                const url = await uploadToCatbox(buffer);
                const mediaMessageObject = mediaContent[mediaType];
                const caption = mediaMessageObject?.caption || '';
                
                value = `[URL]${url}[TYPE]${mediaType}[CAPTION]${caption}`;
            } catch (error) {
                logger.error({ err: error, group: groupId, key }, "Gagal mengunggah media untuk list.");
                return sock.sendMessage(groupId, { text: `Gagal menyimpan media. Terjadi kesalahan: ${error.message}` }, { quoted: m });
            }
        } else {
            let textValue = mediaContent.conversation || mediaContent.extendedTextMessage?.text || '';
            if (!textValue.trim()) {
                return sock.sendMessage(groupId, { text: 'Pesan yang di-reply tidak boleh kosong.' }, { quoted: m });
            }
            value = textValue.trim();
        }

        try {
            statements.setGroupListItem.run({ groupId, key, value });
            await sock.sendMessage(groupId, { text: `✅ Berhasil menyimpan list dengan kunci: *${key}*` }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, group: groupId, key }, "Gagal menyimpan list item.");
            await sock.sendMessage(groupId, { text: `Gagal menyimpan list. Terjadi kesalahan internal.` }, { quoted: m });
        }
    }
};