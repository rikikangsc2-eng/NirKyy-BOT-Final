/*
 * Lokasi: src/commands/group/kick.js
 * Versi: v7
 */

import logger from '#lib/logger.js';
import config from '#config';
import { getParticipantInfo } from '#lib/utils.js';
import { groupMetadataCache } from '#connection';

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
        
        const botJid = sock.user.id;

        const sender = await getParticipantInfo(sock, groupId, m.sender);
        if (!sender || (sender.admin !== 'admin' && sender.admin !== 'superadmin')) {
            return await sock.sendMessage(groupId, { text: 'Hanya admin yang dapat menggunakan perintah ini.' }, { quoted: m });
        }

        const bot = await getParticipantInfo(sock, groupId, botJid);
        if (!bot || (bot.admin !== 'admin' && bot.admin !== 'superadmin')) {
            return await sock.sendMessage(groupId, { text: 'Aku harus jadi admin dulu untuk bisa mengeluarkan anggota.' }, { quoted: m });
        }

        const contextInfo = m.message?.extendedTextMessage?.contextInfo;
        const targetJid = contextInfo?.mentionedJid?.[0] || contextInfo?.participant;

        if (!targetJid) {
            return await sock.sendMessage(groupId, { text: 'Tag atau reply pesan orang yang mau dikeluarkan.' }, { quoted: m });
        }

        if (targetJid === botJid) {
            return await sock.sendMessage(groupId, { text: 'Tidak bisa mengeluarkan diriku sendiri.' }, { quoted: m });
        }
        
        const ownerNumbers = config.ownerNumber || [];
        if (ownerNumbers.includes(targetJid)) {
            return await sock.sendMessage(groupId, { text: 'Tidak bisa mengeluarkan owner bot.' }, { quoted: m });
        }

        const targetUser = await getParticipantInfo(sock, groupId, targetJid);
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