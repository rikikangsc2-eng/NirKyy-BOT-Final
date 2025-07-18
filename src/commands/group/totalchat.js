import { statements } from '#database';
import { groupMetadataCache } from '#connection';

export default {
    name: 'totalchat',
    description: 'Menampilkan 10 anggota grup dengan total chat terbanyak.',
    category: 'group',
    execute: async ({ sock, m }) => {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: 'Perintah ini hanya bisa digunakan di dalam grup.' }, { quoted: m });
        }

        try {
            const topChatters = statements.getTopChatters.all(groupId);

            if (topChatters.length === 0) {
                return sock.sendMessage(groupId, { text: 'Belum ada data chat yang tercatat di grup ini.' }, { quoted: m });
            }

            let metadata = groupMetadataCache.get(groupId);
            if (!metadata) {
                metadata = await sock.groupMetadata(groupId);
                groupMetadataCache.set(groupId, metadata);
            }

            let responseText = '📊 *Top 10 Pengguna Paling Aktif*\n\n';
            const mentions = [];
            
            topChatters.forEach((chatter, index) => {
                const userJid = chatter.user_jid;
                mentions.push(userJid);
                responseText += `${index + 1}. @${userJid.split('@')[0]} - ${chatter.message_count.toLocaleString('id-ID')} pesan\n`;
            });

            await sock.sendMessage(groupId, {
                text: responseText.trim(),
                mentions
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, group: groupId }, "Gagal mengambil data total chat.");
            await sock.sendMessage(groupId, { text: 'Gagal memproses permintaan. Terjadi kesalahan internal.' }, { quoted: m });
        }
    }
};