/*
 * Lokasi: src/commands/group/welcome.js
 * Versi: v4
 */

import { updateGroupSettings } from '#database';
import logger from '#lib/logger.js';
import { getParticipantInfo } from '#lib/utils.js';

export default {
    name: 'welcome',
    description: 'Mengaktifkan atau menonaktifkan fitur selamat datang.',
    execute: async ({ sock, m, args }) => {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return await sock.sendMessage(groupId, { text: 'Cuma bisa di grup, bro.' }, { quoted: m });
        }

        const sender = await getParticipantInfo(sock, groupId, m.sender);
        if (!sender || (sender.admin !== 'admin' && sender.admin !== 'superadmin')) {
            return await sock.sendMessage(groupId, { text: 'Lu bukan admin, ga bisa pake command ini.' }, { quoted: m });
        }

        const action = args[0]?.toLowerCase();
        if (action !== 'on' && action !== 'off') {
            return await sock.sendMessage(groupId, { text: 'Pilih on atau off, bro. Contoh: `.welcome on`' }, { quoted: m });
        }

        const isEnabled = action === 'on' ? 1 : 0;
        const statusText = isEnabled ? 'diaktifkan' : 'dinonaktifkan';

        try {
            updateGroupSettings({
                groupId: groupId,
                antilink: null,
                welcome_en: isEnabled,
                welcome_msg: null
            });

            await sock.sendMessage(groupId, { text: `Sip, fitur welcome udah berhasil ${statusText} di grup ini.` }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, group: groupId }, "Gagal update status welcome");
            await sock.sendMessage(groupId, { text: 'Waduh, ada error pas update status welcome.' }, { quoted: m });
        }
    }
};