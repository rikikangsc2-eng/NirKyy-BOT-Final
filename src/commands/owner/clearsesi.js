/*
 * Lokasi: src/commands/owner/clearsesi.js
 * Versi: v1
 */

import config from '#config';
import logger from '#lib/logger.js';
import { performSessionCleanup } from '#lib/sessionManager.js';

export default {
    name: 'clearsesi',
    aliases: ['clearsession'],
    category: 'owner',
    description: 'Membersihkan file sesi Baileys secara manual. Memerlukan restart setelahnya. (Owner Only)',
    async execute({ sock, m }) {
        if (!config.ownerNumber.includes(m.sender)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah ini hanya untuk owner.' }, { quoted: m });
        }

        const msg = await sock.sendMessage(m.key.remoteJid, { text: 'Memulai pembersihan file sesi... Ini akan membuat bot terputus dan memerlukan restart manual oleh PM2.' }, { quoted: m });

        try {
            const success = await performSessionCleanup('manual');
            if (success) {
                await sock.sendMessage(m.key.remoteJid, { text: '✅ Pembersihan sesi selesai. Bot akan segera berhenti. Harap tunggu PM2 melakukan restart otomatis.', edit: msg.key });
            } else {
                await sock.sendMessage(m.key.remoteJid, { text: 'ℹ️ Tidak ada file sesi yang perlu dibersihkan. Restart tidak diperlukan.', edit: msg.key });
            }
            
            if (success) {
                setTimeout(() => process.exit(1), 2000);
            }
        } catch (error) {
            logger.error({ err: error }, 'Gagal saat menjalankan .clearsesi');
            await sock.sendMessage(m.key.remoteJid, { text: `Gagal membersihkan sesi: ${error.message}`, edit: msg.key });
        }
    }
};