/*
 * Lokasi: src/commands/group/setwelcome.js
 * Versi: v4
 */

import { updateGroupSettings } from '#database';
import logger from '#lib/logger.js';
import { getParticipantInfo } from '#lib/utils.js';

export default {
    name: 'setwelcome',
    description: 'Mengatur pesan selamat datang kustom untuk grup.',
    execute: async ({ sock, m, args }) => {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return await sock.sendMessage(groupId, { text: 'Cuma bisa di grup, bro.' }, { quoted: m });
        }

        const sender = await getParticipantInfo(sock, groupId, m.sender);
        if (!sender || (sender.admin !== 'admin' && sender.admin !== 'superadmin')) {
            return await sock.sendMessage(groupId, { text: 'Lu bukan admin, ga bisa pake command ini.' }, { quoted: m });
        }

        const customMessage = args.join(' ').trim();
        if (!customMessage) {
            return await sock.sendMessage(groupId, { text: 'Teksnya mana, bro?\n\nContoh: `.setwelcome Selamat datang @user di grup @subject!`' }, { quoted: m });
        }

        try {
            updateGroupSettings({
                groupId: groupId,
                antilink: null,
                welcome_en: null,
                welcome_msg: customMessage
            });
            
            await sock.sendMessage(groupId, { text: 'Oke, pesan welcome udah berhasil di-update!' }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, group: groupId }, "Gagal update welcome message");
            await sock.sendMessage(groupId, { text: 'Waduh, ada error pas nyimpen pesan welcome.' }, { quoted: m });
        }
    }
};