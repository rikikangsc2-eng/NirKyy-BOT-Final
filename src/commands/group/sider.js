/*
* Lokasi: src/commands/group/sider.js
* Versi: v1
*/
import { statements } from '#database';
import { getParticipantInfo } from '#lib/utils.js';
import logger from '#lib/logger.js';
import { groupMetadataCache } from '#connection';

export default {
    name: 'sider',
    aliases: ['silent', 'ghost'],
    category: 'group',
    description: 'Menampilkan daftar anggota yang tidak aktif selama 7 hari terakhir. (Admin only)',
    async execute({ sock, m }) {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: 'Perintah ini hanya bisa digunakan di dalam grup.' }, { quoted: m });
        }

        const sender = await getParticipantInfo(sock, groupId, m.sender);
        if (!sender || (sender.admin !== 'admin' && sender.admin !== 'superadmin')) {
            return sock.sendMessage(groupId, { text: 'Hanya admin yang dapat menggunakan perintah ini.' }, { quoted: m });
        }

        await sock.sendMessage(groupId, { text: 'Sip, lagi nyari data anggota yang lagi tapa... 🧘‍♂️' }, { quoted: m });

        try {
            let metadata = groupMetadataCache.get(groupId);
            if (!metadata) {
                metadata = await sock.groupMetadata(groupId);
                groupMetadataCache.set(groupId, metadata);
            }
            const allParticipants = metadata.participants.map(p => p.id);

            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
            const sevenDaysAgoTimestamp = Date.now() - sevenDaysInMs;

            const activeUsersResult = statements.getActiveUsersSince.all(groupId, sevenDaysAgoTimestamp);
            const activeUserJids = new Set(activeUsersResult.map(row => row.user_jid));

            const siders = allParticipants.filter(jid => !activeUserJids.has(jid));

            if (siders.length === 0) {
                return sock.sendMessage(groupId, { text: 'Gokil! Semua anggota di grup ini aktif dalam 7 hari terakhir.' }, { quoted: m });
            }

            let responseText = `👻 *Ditemukan ${siders.length} Anggota Pasif (7 Hari Terakhir)*\n\n`;
            const mentions = [];
            siders.forEach((jid, index) => {
                responseText += `${index + 1}. @${jid.split('@')[0]}\n`;
                mentions.push(jid);
            });

            await sock.sendMessage(groupId, { text: responseText.trim(), mentions }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, group: groupId }, "Gagal menjalankan fitur sider");
            await sock.sendMessage(groupId, { text: 'Waduh, gagal mengambil data sider. Coba lagi nanti.' }, { quoted: m });
        }
    }
};