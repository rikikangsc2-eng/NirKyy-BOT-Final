import db, { getRpgUser, rpgUserCache } from '#database';

const formatToRupiah = (number) => `${Math.floor(number).toLocaleString('id-ID')} 🪙`;

const UPGRADES = {
    energy: {
        name: 'Kapasitas Energi',
        baseCost: 25000,
        costMultiplier: 1.8,
        benefit: 15,
        get_current_level: (user) => (user.max_energy - 100) / 15,
        description: (cost, benefit) => `Tingkatkan *Kapasitas Energi* maksimum sebesar *${benefit}* dengan biaya ${formatToRupiah(cost)}. Ini memungkinkanmu beraktivitas lebih lama sebelum perlu istirahat.`
    }
};

const upgradeTransaction = db.transaction((jid, type, cost) => {
    const upgrade = UPGRADES[type];
    db.prepare('UPDATE rpg_users SET money = money - ?, max_energy = max_energy + ? WHERE jid = ?').run(cost, upgrade.benefit, jid);
    rpgUserCache.delete(jid);
});

export default {
    name: 'upgrade',
    category: 'rpg',
    description: 'Tingkatkan kapasitas permanen milikmu.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const user = getRpgUser(jid);
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` dulu ya.' }, { quoted: m });
        }

        const type = args[0]?.toLowerCase();
        if (!type) {
            let helpText = 'Pilih atribut yang ingin kamu tingkatkan:\n\n';
            for (const [key, upgrade] of Object.entries(UPGRADES)) {
                const level = upgrade.get_current_level(user);
                const cost = upgrade.baseCost * Math.pow(upgrade.costMultiplier, level);
                helpText += `*› ${upgrade.name}* (\`.upgrade ${key}\`)\n`;
                helpText += `  └ Level saat ini: ${level}\n`;
                helpText += `  └ Biaya peningkatan berikutnya: ${formatToRupiah(cost)}\n\n`;
            }
            helpText += '_Peningkatan adalah investasi permanen untuk karaktermu._';
            return await sock.sendMessage(m.key.remoteJid, { text: helpText.trim() }, { quoted: m });
        }

        const upgrade = UPGRADES[type];
        if (!upgrade) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Tipe peningkatan "${type}" tidak ada.` }, { quoted: m });
        }

        const level = upgrade.get_current_level(user);
        const cost = Math.floor(upgrade.baseCost * Math.pow(upgrade.costMultiplier, level));

        const confirmationText = `Apakah kamu yakin ingin melakukan peningkatan?\n\n${upgrade.description(cost, upgrade.benefit)}\n\nKoin kamu: ${formatToRupiah(user.money)}\n\nKetik \`.upgrade ${type} confirm\` untuk melanjutkan.`;
        if (args[1]?.toLowerCase() !== 'confirm') {
            return await sock.sendMessage(m.key.remoteJid, { text: confirmationText }, { quoted: m });
        }

        if (user.money < cost) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Koin tidak cukup. Kamu butuh ${formatToRupiah(cost)}.` }, { quoted: m });
        }

        try {
            upgradeTransaction(jid, type, cost);
            const newMaxEnergy = user.max_energy + upgrade.benefit;
            await sock.sendMessage(m.key.remoteJid, { text: `✅ *Peningkatan Berhasil!* Kapasitas Energimu kini menjadi *${newMaxEnergy}*!` }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Gagal melakukan peningkatan karena gangguan misterius.' }, { quoted: m });
        }
    }
};