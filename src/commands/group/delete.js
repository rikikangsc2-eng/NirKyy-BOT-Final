/*
* Lokasi: src/commands/group/delete.js
* Versi: v9
*/

import logger from '#lib/logger.js';
import { getParticipantInfo, getBotJid } from '#lib/utils.js';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

export default {
    name: 'delete',
    aliases: ['del', 'd'],
    category: 'group',
    description: 'Menghapus pesan yang dibalas. Admin diperlukan untuk menghapus pesan anggota lain.',
    
    async execute({ sock, m }) {
        const isQuoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!isQuoted) {
            return await sock.sendMessage(m.key.remoteJid, { 
                text: 'Bro, reply dulu pesan yang mau dihapus pake perintah ini.' 
            }, { quoted: m });
        }

        const remoteJid = m.key.remoteJid;
        const { stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
        
        const botJid = getBotJid(sock);
        const isBotMessage = jidNormalizedUser(participant) === botJid;

        if (isBotMessage) {
            const key = {
                remoteJid,
                fromMe: true,
                id: stanzaId,
            };
            try {
                await sock.sendMessage(remoteJid, { delete: key });
            } catch (error) {
                logger.error({ err: error, key }, "Gagal menghapus pesan bot");
                await sock.sendMessage(remoteJid, { text: 'Waduh, gagal hapus pesannya.' }, { quoted: m });
            }
            return;
        }

        if (!remoteJid.endsWith('@g.us')) {
            return await sock.sendMessage(remoteJid, { text: 'Cuma bisa hapus pesan orang lain di dalam grup, bro.' }, { quoted: m });
        }

        const botParticipantInfo = await getParticipantInfo(sock, remoteJid, botJid);
        if (botParticipantInfo?.admin !== 'admin' && botParticipantInfo?.admin !== 'superadmin') {
            return await sock.sendMessage(remoteJid, { text: 'Aku harus jadi admin dulu buat bisa hapus pesan orang lain.' }, { quoted: m });
        }

        const sender = await getParticipantInfo(sock, remoteJid, m.sender);
        if (sender?.admin !== 'admin' && sender?.admin !== 'superadmin') {
            return await sock.sendMessage(remoteJid, { text: 'Cuma admin yang bisa pake perintah ini buat hapus pesan orang lain.' }, { quoted: m });
        }

        const key = {
            remoteJid,
            id: stanzaId,
            participant,
        };
        try {
            await sock.sendMessage(remoteJid, { delete: key });
        } catch (error) {
            logger.error({ err: error, key }, "Gagal menghapus pesan member");
            await sock.sendMessage(remoteJid, { text: 'Gagal hapus pesannya, mungkin udah kelamaan atau ada masalah lain.' }, { quoted: m });
        }
    }
};