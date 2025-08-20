/*
 * Lokasi: src/commands/group/dellist.js
 * Versi: v4
 */

import { statements } from '#database';
import logger from '#lib/logger.js';
import { getParticipantInfo } from '#lib/utils.js';

export default {
    name: 'dellist',
    aliases: ['deletelist', 'hpslist'],
    description: 'Menghapus item dari daftar kustom grup. Admin only.',
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
        
        const key = args.join(' ').toLowerCase();
        if (!key) {
            return sock.sendMessage(groupId, { text: 'Harap berikan kunci list yang akan dihapus.\n\nContoh: `.dellist aturan grup`' }, { quoted: m });
        }
        
        try {
            const info = statements.deleteGroupListItem.run(groupId, key);
            if (info.changes > 0) {
                await sock.sendMessage(groupId, { text: `✅ Kunci list *${key}* berhasil dihapus.` }, { quoted: m });
            } else {
                await sock.sendMessage(groupId, { text: `⚠️ Kunci list *${key}* tidak ditemukan.` }, { quoted: m });
            }
        } catch (error) {
            logger.error({ err: error, group: groupId, key }, "Gagal menghapus list item.");
            await sock.sendMessage(groupId, { text: `Gagal menghapus list. Terjadi kesalahan internal.` }, { quoted: m });
        }
    }
};