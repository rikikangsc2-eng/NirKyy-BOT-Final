/*
 * Lokasi: src/commands/group/antilink.js
 * Versi: v4
 */

import { updateGroupSettings } from '#database';
import logger from '#lib/logger.js';
import { getParticipantInfo } from '#lib/utils.js';

export default {
    name: 'antilink',
    description: 'Mengaktifkan atau menonaktifkan fitur anti-link di grup.',
    category: 'group',
    async execute({ sock, m, args }) {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return await sock.sendMessage(groupId, { text: 'Perintah ini hanya bisa digunakan di dalam grup.' }, { quoted: m });
        }

        const sender = await getParticipantInfo(sock, groupId, m.sender);
        if (!sender || (sender.admin !== 'admin' && sender.admin !== 'superadmin')) {
            return await sock.sendMessage(groupId, { text: 'Perintah ini hanya untuk admin grup.' }, { quoted: m });
        }

        const action = args[0]?.toLowerCase();
        if (action !== 'on' && action !== 'off') {
            return await sock.sendMessage(groupId, { text: 'Gunakan `on` untuk mengaktifkan atau `off` untuk menonaktifkan.\n\nContoh: `.antilink on`' }, { quoted: m });
        }

        const isEnabled = action === 'on' ? 1 : 0;
        const statusText = isEnabled ? 'diaktifkan' : 'dinonaktifkan';

        try {
            updateGroupSettings({
                groupId: groupId,
                antilink: isEnabled,
                welcome_en: null,
                welcome_msg: null
            });

            await sock.sendMessage(groupId, { text: `✅ Fitur anti-link telah berhasil *${statusText}* di grup ini.` }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, group: groupId }, "Gagal update status anti-link");
            await sock.sendMessage(groupId, { text: 'Waduh, terjadi error saat memperbarui status anti-link.' }, { quoted: m });
        }
    }
};