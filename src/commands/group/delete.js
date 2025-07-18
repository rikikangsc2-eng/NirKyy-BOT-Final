import { groupMetadataCache } from '#connection';
import logger from '#lib/logger.js';

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
        
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const isBotMessage = participant === botId;

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

        let metadata;
        try {
            metadata = groupMetadataCache.get(remoteJid) || await sock.groupMetadata(remoteJid);
            groupMetadataCache.set(remoteJid, metadata);
        } catch (error) {
            logger.error({ err: error, group: remoteJid }, "Gagal mengambil metadata grup untuk perintah delete.");
            return await sock.sendMessage(remoteJid, { text: 'Gagal proses perintah, gabisa ambil data grup.' }, { quoted: m });
        }
        
        const bot = metadata.participants.find(p => p.id === botId);
        if (bot?.admin !== 'admin' && bot?.admin !== 'superadmin') {
            return await sock.sendMessage(remoteJid, { text: 'Aku harus jadi admin dulu buat bisa hapus pesan orang lain.' }, { quoted: m });
        }

        const sender = metadata.participants.find(p => p.id === m.sender);
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