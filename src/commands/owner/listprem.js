import db from '#database';
import config from '#config';

export default {
    name: 'listprem',
    category: 'owner',
    description: 'Menampilkan daftar pengguna premium yang aktif.',
    async execute({ sock, m }) {
        if (!config.ownerNumber.includes(m.sender)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Fitur ini cuma buat owner, bro.' }, { quoted: m });
        }

        try {
            const now = Date.now();
            const premiumUsers = db.prepare(`
                SELECT jid, premium_expires_at 
                FROM users 
                WHERE is_premium = 1 AND premium_expires_at > ? 
                ORDER BY premium_expires_at ASC
            `).all(now);

            if (premiumUsers.length === 0) {
                return await sock.sendMessage(m.key.remoteJid, { text: 'Saat ini tidak ada pengguna premium yang aktif.' }, { quoted: m });
            }

            let responseText = '👑 *Daftar Pengguna Premium Aktif* 👑\n\n';
            const mentions = [];

            premiumUsers.forEach((user, index) => {
                const userTag = `@${user.jid.split('@')[0]}`;
                const expiryDate = new Date(user.premium_expires_at).toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                responseText += `${index + 1}. ${userTag} - Berakhir pada *${expiryDate}*\n`;
                mentions.push(user.jid);
            });

            await sock.sendMessage(m.key.remoteJid, { text: responseText.trim(), mentions: mentions }, { quoted: m });

        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal mengambil daftar premium dari database.' }, { quoted: m });
        }
    }
};