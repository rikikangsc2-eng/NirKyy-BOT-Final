/*
 * Lokasi: src/commands/info/limit.js
 * Versi: v4
 */

import { getAndManageUserLimit } from '#processors/limitProcessor.js';
import config from '#config';
import { checkSpecialGroupMembership } from '#lib/utils.js';

export default {
    name: 'limit',
    aliases: ['ceklimit', 'limits'],
    category: 'info',
    description: 'Cek sisa limit lu.',
    async execute({ sock, m }) {
        const jid = m.sender;
        const user = await getAndManageUserLimit(sock, jid);
        const isMemberOfSpecialGroup = await checkSpecialGroupMembership(sock, jid);

        let replyText;

        if (user && user.is_premium) {
            replyText = '✨ *Status Limit: Premium*\n\nLu punya *Limit Tak Terbatas*! Gass terus, bro!';
        } else {
            const maxLimit = isMemberOfSpecialGroup ? 700 : 5;
            const limitType = isMemberOfSpecialGroup ? 'Mingguan' : 'Harian';
            const status = isMemberOfSpecialGroup ? 'Anggota Spesial' : 'Standar';
            const currentUsage = user?.limit_usage || 0;

            replyText = `📊 *Status Limit ${limitType} Kamu*\n\n› Tipe Akun: *${status}*\n› Limit Terpakai: *${currentUsage} / ${maxLimit}*`;
        }

        await sock.sendMessage(m.key.remoteJid, { text: replyText }, { quoted: m });
    }
};