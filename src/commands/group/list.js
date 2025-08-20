import { statements } from '#database';
import config from '#config';

export default {
    name: 'list',
    description: 'Menampilkan semua kunci list yang tersimpan di grup.',
    category: 'group',
    execute: async ({ sock, m }) => {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: 'Perintah ini hanya bisa digunakan di dalam grup.' }, { quoted: m });
        }

        try {
            const items = statements.getAllGroupListItems.all(groupId);
            if (items.length === 0) {
                return sock.sendMessage(groupId, { text: 'Belum ada list yang tersimpan di grup ini.' }, { quoted: m });
            }

            const prefix = config.prefix;
            let responseText = `📋 *Daftar List Tersimpan*\n\nGunakan \`${prefix}[nama_list]\` untuk melihat isinya.\n\n`;
            responseText += items.map(item => `• ${prefix}${item.list_key}`).join('\n');
            
            await sock.sendMessage(groupId, { text: responseText }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, group: groupId }, "Gagal mengambil daftar list.");
            await sock.sendMessage(groupId, { text: `Gagal mengambil daftar. Terjadi kesalahan internal.` }, { quoted: m });
        }
    }
};