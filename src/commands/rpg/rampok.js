import db, { getRpgUser, rpgUserCache } from '#database';

const ROB_COOLDOWN = 10 * 60 * 1000;
const SUCCESS_CHANCE = 0.40;
const PENALTY_PERCENT = 0.10; 
const ARMOR_PROTECTION_DIVISOR = 2;

const formatToRupiah = (number) => `${Math.round(number).toLocaleString('id-ID')} 🪙`;

const robTransaction = db.transaction((robberJid, victimJid, amount) => {
    db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(amount, robberJid);
    db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(amount, victimJid);
    rpgUserCache.delete(robberJid);
    rpgUserCache.delete(victimJid);
});

const penaltyTransaction = db.transaction((robberJid, penalty, useArmor) => {
    db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(penalty, robberJid);
    if (useArmor) {
        db.prepare('UPDATE rpg_inventory SET quantity = quantity - 1 WHERE user_jid = ? AND item_name = ?').run(robberJid, 'Armor Kulit');
    }
    rpgUserCache.delete(robberJid);
});

export default {
    name: 'rampok',
    aliases: ['sergap'],
    category: 'rpg',
    description: 'Menyergap Orang Tersesat lain untuk merebut koin mereka.',
    async execute({ sock, m }) {
        const robberJid = m.sender;
        const victimJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

        if (!victimJid) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Siapa yang mau disergap? Tandai targetmu. Contoh: `.rampok @target`' }, { quoted: m });
        }
        if (victimJid === robberJid) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Menyergap bayanganmu sendiri? Ide yang aneh.' }, { quoted: m });
        }

        const robber = getRpgUser(robberJid);
        if (!robber) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` dulu ya.' }, { quoted: m });
        }
        
        const now = Date.now();
        const timeSinceLastRob = now - (robber.last_rob || 0);
        if (timeSinceLastRob < ROB_COOLDOWN) {
            const timeLeft = ROB_COOLDOWN - timeSinceLastRob;
            const minutes = Math.floor(timeLeft / 60000);
            return await sock.sendMessage(m.key.remoteJid, { text: `Kamu perlu bersembunyi sejenak setelah percobaan terakhir. Tunggu *${minutes} menit* lagi.` }, { quoted: m });
        }

        const victim = getRpgUser(victimJid);
        if (!victim) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Targetmu tidak dikenali di dunia ini.' }, { quoted: m });
        }
        const minRobAmount = 500;
        if (victim.money < minRobAmount) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Targetmu terlihat tidak memiliki cukup koin. Mencari mangsa lain adalah pilihan bijak.` }, { quoted: m });
        }

        db.prepare('UPDATE rpg_users SET last_rob = ? WHERE jid = ?').run(now, robberJid);
        rpgUserCache.delete(robberJid);

        const isSuccess = Math.random() < SUCCESS_CHANCE;

        if (isSuccess) {
            const amountStolen = Math.floor(victim.money * (Math.random() * 0.4 + 0.1));
            robTransaction(robberJid, victimJid, amountStolen);
            const message = `*Sergapan Berhasil!* ⚔️\nKamu berhasil menyergap *${victim.name}* dan merebut *${formatToRupiah(amountStolen)}*!`;
            await sock.sendMessage(m.key.remoteJid, { text: message, mentions: [victimJid] });
        } else {
            const penaltyAmount = Math.floor(robber.money * PENALTY_PERCENT);
            const armor = db.prepare('SELECT quantity FROM rpg_inventory WHERE user_jid = ? AND item_name = ?').get(robberJid, 'Armor Kulit');
            const hasArmor = armor && armor.quantity > 0;
            const finalPenalty = hasArmor ? Math.round(penaltyAmount / ARMOR_PROTECTION_DIVISOR) : penaltyAmount;

            penaltyTransaction(robberJid, finalPenalty, hasArmor);
            
            let message;
            if (hasArmor) {
                message = `*Sergapan Gagal!* 🛡️\nUntungnya, *Armor Kulit* melindungimu dari serangan balasan! Kamu hanya kehilangan *${formatToRupiah(finalPenalty)}*. Armor-mu hancur dalam proses.`;
            } else {
                message = `*Sergapan Gagal!* ❌\nKamu ketahuan saat mencoba menyergap *${victim.name}* dan kehilangan *${formatToRupiah(finalPenalty)}* (${PENALTY_PERCENT * 100}% dari koinmu) sebagai akibatnya.`;
            }
            await sock.sendMessage(m.key.remoteJid, { text: message, mentions: [victimJid] });
        }
    }
};