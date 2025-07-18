// Path: src/commands/info/limit.js
import { LRUCache } from 'lru-cache';
import { statements } from '#database';
import config from '#config';
import logger from '#lib/logger.js';

const groupMembershipCache = new LRUCache({ max: 500, ttl: 1000 * 60 * 15 });

async function checkUserGroupMembership(sock, userJid) {
    if (!config.specialLimitGroup) return false;
    if (groupMembershipCache.has(userJid)) {
        return groupMembershipCache.get(userJid);
    }
    try {
        const metadata = await sock.groupMetadata(config.specialLimitGroup);
        const isMember = metadata.participants.some(p => p.id === userJid);
        groupMembershipCache.set(userJid, isMember);
        return isMember;
    } catch (error) {
        logger.warn({ err: error, group: config.specialLimitGroup }, "Gagal memeriksa keanggotaan grup spesial dari command .limit.");
        groupMembershipCache.set(userJid, false);
        return false;
    }
}

export default {
    name: 'limit',
    aliases: ['ceklimit', 'limits'],
    category: 'info',
    description: 'Cek sisa limit harian lu.',
    async execute({ sock, m }) {
        const jid = m.sender;
        const mainUser = statements.getUserForLimiting.get(jid);
        const isMemberOfSpecialGroup = await checkUserGroupMembership(sock, jid);

        let replyText;

        if (mainUser && mainUser.is_premium) {
            replyText = '✨ *Status Limit: Premium*\n\nLu punya *Limit Tak Terbatas*! Gass terus, bro!';
        } else {
            const maxLimit = isMemberOfSpecialGroup ? 20 : 5;
            const currentUsage = mainUser?.limit_usage || 0;
            const status = isMemberOfSpecialGroup ? 'Anggota Spesial' : 'Standar';

            replyText = `📊 *Status Limit Harian Kamu*\n\n› Tipe Akun: *${status}*\n› Limit Terpakai: *${currentUsage} / ${maxLimit}*`;
        }

        await sock.sendMessage(m.key.remoteJid, { text: replyText }, { quoted: m });
    }
};