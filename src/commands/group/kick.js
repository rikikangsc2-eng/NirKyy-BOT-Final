import { groupMetadataCache } from '#connection';
import logger from '#lib/logger.js';
import config from '#config';

export default {
    name: 'kick',
    aliases: ['tendang'],
    category: 'group',
    description: 'Mengeluarkan anggota dari grup.',
    
    async execute({ sock, m }) {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return await sock.sendMessage(groupId, { text: 'Perintah ini hanya bisa digunakan di dalam grup.' }, { quoted: m });
        }

        let metadata;
        try {
            metadata = groupMetadataCache.get(groupId) || await sock.groupMetadata(groupId);
            groupMetadataCache.set(groupId, metadata);
        } catch (error) {
            logger.error({ err: error, group: groupId }, "Gagal mengambil metadata grup untuk perintah kick.");
            return await sock.sendMessage(groupId, { text: 'Gagal memproses perintah, tidak bisa ambil data grup.' }, { quoted: m });
        }

        const sender = metadata.participants.find(p => p.id === m.sender);
        if (!sender || (sender.admin !== 'admin' && sender.admin !== 'superadmin')) {
            return await sock.sendMessage(groupId, { text: 'Hanya admin yang dapat menggunakan perintah ini.' }, { quoted: m });
        }

        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const bot = metadata.participants.find(p => p.id === botId);
        if (!bot || (bot.admin !== 'admin' && bot.admin !== 'superadmin')) {
            return await sock.sendMessage(groupId, { text: 'Aku harus jadi admin dulu untuk bisa mengeluarkan anggota.' }, { quoted: m });
        }

        const contextInfo = m.message?.extendedTextMessage?.contextInfo;
        const targetJid = contextInfo?.mentionedJid?.[0] || contextInfo?.participant;

        if (!targetJid) {
            return await sock.sendMessage(groupId, { text: 'Tag atau reply pesan orang yang mau dikeluarkan.' }, { quoted: m });
        }

        if (targetJid === botId) {
            return await sock.sendMessage(groupId, { text: 'Tidak bisa mengeluarkan diriku sendiri.' }, { quoted: m });
        }
        
        const ownerNumbers = config.ownerNumber || [];
        if (ownerNumbers.includes(targetJid)) {
            return await sock.sendMessage(groupId, { text: 'Tidak bisa mengeluarkan owner bot.' }, { quoted: m });
        }

        const targetUser = metadata.participants.find(p => p.id === targetJid);
        if (!targetUser) {
            return await sock.sendMessage(groupId, { text: 'Target tidak ditemukan di dalam grup ini.' }, { quoted: m });
        }

        try {
            await sock.sendMessage(groupId, { text: `Perintah diterima. Mengeluarkan @${targetJid.split('@')[0]}...`, mentions: [targetJid] });
            await sock.groupParticipantsUpdate(groupId, [targetJid], 'remove');
        } catch (error) {
            logger.error({ err: error, group: groupId, target: targetJid }, "Gagal mengeluarkan anggota.");
            await sock.sendMessage(groupId, { text: `Gagal mengeluarkan anggota. Mungkin dia adalah admin dengan level yang lebih tinggi.` }, { quoted: m });
        }
    }
};