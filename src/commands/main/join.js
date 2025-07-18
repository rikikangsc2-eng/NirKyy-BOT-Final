import db, { getRpgUser, rpgUserCache } from '#database';
import logger from '#lib/logger.js';

const JOIN_COST = 5000000;
const GROUP_INVITE_REGEX = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i;

const formatCoin = (number) => `${number.toLocaleString('id-ID')} 🪙`;

export default {
    name: 'join',
    category: 'rpg',
    description: 'Memerintahkan bot untuk bergabung ke grup menggunakan tautan undangan dengan biaya yang sangat tinggi.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const link = args[0];

        if (!link) {
            return await sock.sendMessage(m.key.remoteJid, { 
                text: `Untuk memanggilku ke sebuah grup, kamu memerlukan tautan undangan dan biaya jasa yang sangat besar.\n\n*Biaya:* ${formatCoin(JOIN_COST)}\n*Format:* \`.join <link_grup>\``
            }, { quoted: m });
        }

        const match = link.match(GROUP_INVITE_REGEX);
        if (!match) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Tautan undangan yang kamu berikan sepertinya tidak valid.' }, { quoted: m });
        }

        const user = getRpgUser(jid);
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` dulu.' }, { quoted: m });
        }

        if (user.money < JOIN_COST) {
            return await sock.sendMessage(m.key.remoteJid, { 
                text: `Koinmu tidak cukup untuk membayar jasa sebesar ini.\n\n*Biaya Diperlukan:* ${formatCoin(JOIN_COST)}\n*Koin Kamu:* ${formatCoin(user.money)}` 
            }, { quoted: m });
        }

        const inviteCode = match[1];

        try {
            await sock.groupAcceptInvite(inviteCode);
            
            db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(JOIN_COST, jid);
            rpgUserCache.delete(jid);
            
            await sock.sendMessage(m.key.remoteJid, { 
                text: `Perintah diterima. Biaya sebesar *${formatCoin(JOIN_COST)}* telah dibayarkan. Aku akan segera bergabung ke grup tersebut.`
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, groupCode: inviteCode, user: jid }, 'Gagal bergabung ke grup via undangan');
            await sock.sendMessage(m.key.remoteJid, {
                text: `Aku gagal bergabung. Mungkin tautannya sudah tidak valid, grupnya penuh, atau aku sudah ada di sana.\n\nTenang, koinmu tidak jadi terpotong.`
            }, { quoted: m });
        }
    }
};