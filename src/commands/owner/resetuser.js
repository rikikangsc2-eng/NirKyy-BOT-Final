/*
* Lokasi: src/commands/owner/resetuser.js
* Versi: v1
*/

import db, { statements, rpgUserCache } from '#database';
import config from '#config';
import logger from '#lib/logger.js';

export default {
    name: 'resetuser',
    category: 'owner',
    description: 'Mereset data RPG seorang pengguna secara paksa. (Owner Only)',
    async execute({ sock, m, args }) {
        if (!config.ownerNumber.includes(m.sender)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah ini hanya untuk owner.' }, { quoted: m });
        }

        const userName = args.join(' ');
        if (!userName) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Format salah. Gunakan: `.resetuser <nama_rpg_pengguna>`' }, { quoted: m });
        }

        const userToReset = statements.getUserByName.get(userName);
        if (!userToReset) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Pengguna dengan nama RPG "${userName}" tidak ditemukan.` }, { quoted: m });
        }

        const targetJid = userToReset.jid;

        try {
            const resetTransaction = db.transaction(() => {
                statements.deleteRpgUser.run(targetJid);
            });
            resetTransaction();
            rpgUserCache.delete(targetJid);

            await sock.sendMessage(m.key.remoteJid, { text: `✅ Berhasil mereset data RPG untuk pengguna *${userToReset.name}* (${targetJid}).` }, { quoted: m });

            const userMessage = `Peringatan: Akun RPG Anda telah direset oleh Administrator.\n\n*Alasan:* Terdeteksi adanya aktivitas yang tidak wajar, kemungkinan penyalahgunaan bug atau sejenisnya.\n\nIni adalah peringatan. Jika Anda memiliki pertanyaan, silakan hubungi owner bot.`;
            try {
                await sock.sendMessage(targetJid, { text: userMessage });
            } catch (dmError) {
                logger.warn({ err: dmError, user: targetJid }, 'Gagal mengirim pesan reset ke pengguna (mungkin diblokir).');
                await sock.sendMessage(m.key.remoteJid, { text: `Gagal mengirim notifikasi reset ke pengguna (kemungkinan bot diblokir).` }, { quoted: m });
            }

        } catch (error) {
            logger.error({ err: error, target: targetJid }, 'Gagal mereset data pengguna RPG.');
            await sock.sendMessage(m.key.remoteJid, { text: `Terjadi error saat mencoba mereset data untuk *${userToReset.name}*.` }, { quoted: m });
        }
    }
};