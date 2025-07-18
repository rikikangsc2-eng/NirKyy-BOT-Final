import { statements } from '#database';

export default {
    name: 'addlist',
    description: 'Menambah atau memperbarui item dalam daftar kustom grup. Admin only.',
    category: 'group',
    execute: async ({ sock, m, args, text }) => {
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
        if (!key || !/^[a-z0-9]+$/.test(key)) {
            return sock.sendMessage(groupId, { text: 'Format salah. Kunci harus berupa satu kata tanpa spasi atau simbol.\n\nContoh: `.addlist info Teks informasi grup.`' }, { quoted: m });
        }

        let value;
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMessage) {
            value = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation ||
                    m.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text || '';
        } else {
            value = args.slice(1).join(' ');
        }
        
        if (!value.trim()) {
            return sock.sendMessage(groupId, { text: 'Nilai (value) untuk list tidak boleh kosong. Balas pesan atau ketik teks setelah kunci.\n\nContoh: `.addlist aturan Dilarang spam.`' }, { quoted: m });
        }

        try {
            statements.setGroupListItem.run({ groupId, key, value: value.trim() });
            await sock.sendMessage(groupId, { text: `✅ Berhasil menyimpan list dengan kunci: *${key}*` }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, group: groupId, key }, "Gagal menyimpan list item.");
            await sock.sendMessage(groupId, { text: `Gagal menyimpan list. Terjadi kesalahan internal.` }, { quoted: m });
        }
    }
};