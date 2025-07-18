import { statements } from '#database';

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
        
        const metadata = await sock.groupMetadata(groupId);
        const sender = metadata.participants.find(p => p.id === m.sender);
        if (sender.admin !== 'admin' && sender.admin !== 'superadmin') {
            return sock.sendMessage(groupId, { text: 'Hanya admin yang dapat menggunakan perintah ini.' }, { quoted: m });
        }
        
        const key = args[0]?.toLowerCase();
        if (!key) {
            return sock.sendMessage(groupId, { text: 'Harap berikan kunci list yang akan dihapus.\n\nContoh: `.dellist aturan`' }, { quoted: m });
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