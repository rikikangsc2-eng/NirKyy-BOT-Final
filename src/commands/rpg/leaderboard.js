import db from '#database';

const formatToRupiah = (number) => `${number.toLocaleString('id-ID')} 🪙`;

export default {
    name: 'terkaya',
    aliases: ['leaderboard', 'lb', 'top'],
    category: 'rpg',
    description: 'Menampilkan 10 Orang Tersesat terkaya di Arcadia.',
    async execute({ sock, m }) {
        try {
            const topUsers = db.prepare(`
                SELECT name, (money + bank_balance) as total_wealth 
                FROM rpg_users
                WHERE (money + bank_balance) > 0
                ORDER BY total_wealth DESC
                LIMIT 10
            `).all();

            if (topUsers.length === 0) {
                return await sock.sendMessage(m.key.remoteJid, { text: 'Belum ada Orang Tersesat yang tercatat dalam Peringkat Kekayaan Arcadia.' }, { quoted: m });
            }

            let leaderboardText = '🏆 *Peringkat Kekayaan Arcadia* 🏆\n\n_Daftar 10 Orang Tersesat dengan total koin terbanyak._\n\n';
            topUsers.forEach((user, index) => {
                const medal = ['🥇', '🥈', '🥉'][index] || ` ${index + 1}.`;
                leaderboardText += `${medal} *${user.name}* - ${formatToRupiah(user.total_wealth)}\n`;
            });

            await sock.sendMessage(m.key.remoteJid, { text: leaderboardText.trim() }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Gagal mengambil data dari arsip Arcadia.' }, { quoted: m });
        }
    }
};