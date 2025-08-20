import db, { getRpgUser, rpgUserCache } from '#database';

const BEG_COOLDOWN = 2 * 60 * 60 * 1000;
const MONEY_THRESHOLD = 1000;
const ENERGY_THRESHOLD = 10;
const BEG_REWARD = 1500;

const begTransaction = db.transaction((jid, now) => {
    db.prepare('UPDATE rpg_users SET money = money + ?, last_beg = ? WHERE jid = ?').run(BEG_REWARD, now, jid);
    rpgUserCache.delete(jid);
});

export default {
    name: 'mengemis',
    aliases: ['beg', 'minta'],
    category: 'rpg',
    description: 'Meminta belas kasihan saat benar-benar tidak punya apa-apa.',
    async execute({ sock, m }) {
        const jid = m.sender;
        const user = getRpgUser(jid);

        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum terdaftar di dunia ini.' }, { quoted: m });
        }

        if (user.money > MONEY_THRESHOLD || user.energy > ENERGY_THRESHOLD) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Kamu tidak terlihat cukup putus asa untuk mengemis. Coba cari cara lain.` }, { quoted: m });
        }

        const now = Date.now();
        const timeSinceLastBeg = now - (user.last_beg || 0);

        if (timeSinceLastBeg < BEG_COOLDOWN) {
            const timeLeft = BEG_COOLDOWN - timeSinceLastBeg;
            const hours = Math.floor(timeLeft / 3600000);
            const minutes = Math.floor((timeLeft % 3600000) / 60000);
            return await sock.sendMessage(m.key.remoteJid, { text: `Orang-orang sudah bosan melihatmu. Tunggu *${hours} jam ${minutes} menit* lagi sebelum mencoba peruntungan.` }, { quoted: m });
        }

        try {
            begTransaction(jid, now);
            const rewardText = BEG_REWARD.toLocaleString('id-ID');
            await sock.sendMessage(m.key.remoteJid, { text: `Seorang dermawan yang baik hati merasa kasihan dan memberimu *${rewardText}* 🪙. Gunakan dengan bijak.` }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Terjadi kesalahan saat meminta-minta. Nasibmu sungguh sial.' }, { quoted: m });
        }
    }
};