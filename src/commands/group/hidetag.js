/*
 * Lokasi: src/commands/group/hidetag.js
 * Versi: v8
 */

import { groupMetadataCache } from '#connection';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';
import { getParticipantInfo, getBotJid, getNumber } from '#lib/utils.js';

export default {
    name: 'hidetag',
    aliases: ['h'],
    description: 'Tag semua member grup secara tersembunyi dengan teks atau media.',
    category: 'group',
    async execute({ sock, m, args }) {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return await sock.sendMessage(groupId, { text: 'Cuma bisa di grup, bro.' }, { quoted: m });
        }
        
        const sender = await getParticipantInfo(sock, groupId, m.sender);
        if (!sender || (sender.admin !== 'admin' && sender.admin !== 'superadmin')) {
            return await sock.sendMessage(groupId, { text: 'Lu bukan admin, ga bisa pake command ini.' }, { quoted: m });
        }

        let metadata = groupMetadataCache.get(groupId);
        if (!metadata) {
            metadata = await sock.groupMetadata(groupId);
            groupMetadataCache.set(groupId, metadata);
        }

        const allParticipantJids = metadata.participants.map(p => p.id);
        const captionText = args.join(' ').trim();

        let messageToProcess = m;
        let contentSourceMessage = m.message;
        const isQuoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (isQuoted) {
             const { quotedMessage, stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
             const botJid = getBotJid(sock);
             messageToProcess = {
                key: {
                    remoteJid: m.key.remoteJid,
                    id: stanzaId,
                    fromMe: getNumber(participant) === getNumber(botJid),
                    participant: participant
                },
                message: quotedMessage
            };
            contentSourceMessage = quotedMessage;
        }

        const mediaType = Object.keys(contentSourceMessage || {}).find(k => k.endsWith('Message') && !k.startsWith('extendedTextMessage') && !k.includes('senderKey') && !k.includes('protocol'));
        
        let hasContent = false;
        let messagePayload = {};

        if (mediaType && mediaType !== 'conversation') {
            try {
                const buffer = await downloadMediaMessage(messageToProcess, 'buffer', {});
                const originalCaption = contentSourceMessage[mediaType]?.caption || '';
                const finalCaption = captionText || originalCaption;
                
                hasContent = true;

                switch (mediaType) {
                    case 'imageMessage':
                        messagePayload = { image: buffer, caption: finalCaption, mentions: allParticipantJids };
                        break;
                    case 'videoMessage':
                        messagePayload = { video: buffer, caption: finalCaption, mentions: allParticipantJids };
                        break;
                    case 'audioMessage':
                        await sock.sendMessage(groupId, { audio: buffer, mimetype: 'audio/mp4' });
                        await sock.sendMessage(groupId, { text: finalCaption || '\u200B', mentions: allParticipantJids });
                        return;
                    case 'stickerMessage':
                        await sock.sendMessage(groupId, { sticker: buffer });
                        await sock.sendMessage(groupId, { text: finalCaption || '\u200B', mentions: allParticipantJids });
                        return;
                    default:
                        hasContent = false;
                }
            } catch (error) {
                logger.error({ err: error }, 'Failed to process media for hidetag.');
                return await sock.sendMessage(groupId, { text: 'Gagal memproses media untuk hidetag.' }, { quoted: m });
            }
        } else {
            const textFromQuoted = isQuoted ? (contentSourceMessage.conversation || contentSourceMessage.extendedTextMessage?.text) : '';
            const final_text = captionText || textFromQuoted;

            if (final_text) {
                hasContent = true;
                messagePayload = { text: final_text, mentions: allParticipantJids };
            }
        }

        if (!hasContent) {
            return await sock.sendMessage(groupId, { text: 'Pesennya mana, bro? Contoh: .hidetag Rapat! atau reply pesan/media.' }, { quoted: m });
        }

        await sock.sendMessage(groupId, messagePayload);
    }
};