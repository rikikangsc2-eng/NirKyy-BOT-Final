import db, { getRpgUser, rpgUserCache } from '#database';

const formatToRupiah = (number) => `${number.toLocaleString('id-ID')} 🪙`;

const consumableItems = [
    {
        name: 'Daging Panggang',
        effect: { type: 'energy', value: 50 },
        description: 'Memulihkan 50 energi.',
        message: (value) => `🍖 Nyam.. Kamu memakan *1 Daging Panggang* dan memulihkan *${value}* energi!`
    },
    {
        name: 'Sup Ikan Energi',
        effect: { type: 'energy', value: 100 },
        description: 'Memulihkan 100 energi.',
        message: (value) => `🍲 Slurp.. Kamu menyantap *Sup Ikan Energi* yang hangat dan memulihkan *${value}* energi!`
    },
    {
        name: 'Sashimi Keberuntungan',
        effect: { type: 'money', min: 5000, max: 20000 },
        description: 'Memberikan sejumlah koin secara acak saat dikonsumsi.',
        message: (value) => `🍣 Rasanya aneh... tapi tiba-tiba kamu menemukan *${formatToRupiah(value)}* terselip di dalamnya! Hoki banget!`
    },
    {
        name: 'Eliksir Energi Kecil',
        effect: { type: 'energy', value: 40 },
        description: 'Memulihkan 40 energi.',
        message: (value) => `🧪 Kamu menenggak *Eliksir Energi Kecil* dan merasakan kekuatan sihir memulihkan *${value}* energimu!`
    }
];

const consumeTransaction = db.transaction((jid, itemName, result) => {
    if (result.type === 'energy') {
        db.prepare('UPDATE rpg_users SET energy = ? WHERE jid = ?').run(result.newEnergy, jid);
    } else if (result.type === 'money') {
        db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(result.gained, jid);
    }
    db.prepare('UPDATE rpg_inventory SET quantity = quantity - 1 WHERE user_jid = ? AND item_name = ?').run(jid, itemName);
    rpgUserCache.delete(jid);
});

export default {
    name: 'konsumsi',
    aliases: ['use', 'eat'],
    category: 'rpg',
    description: 'Menggunakan atau memakan item dari inventaris melalui daftar.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const user = getRpgUser(jid);
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` dulu.' }, { quoted: m });
        }

        const choice = parseInt(args[0], 10);

        if (isNaN(choice)) {
            const inventory = db.prepare('SELECT item_name, quantity FROM rpg_inventory WHERE user_jid = ?').all(jid);
            const userInventoryMap = new Map(inventory.map(i => [i.item_name, i.quantity]));

            let listText = 'Pilih item yang ingin kamu konsumsi:\n\n';
            consumableItems.forEach((item, index) => {
                const owned = userInventoryMap.get(item.name) || 0;
                listText += `*${index + 1}. ${item.name}* (Kamu punya: ${owned})\n`;
                listText += `   └ _Efek: ${item.description}_\n\n`;
            });
            listText += "Ketik `.konsumsi <nomor>` untuk menggunakan item.";
            return await sock.sendMessage(m.key.remoteJid, { text: listText.trim() }, { quoted: m });
        }

        if (choice < 1 || choice > consumableItems.length) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Pilihan tidak valid. Pilih nomor dari daftar `.konsumsi`.' }, { quoted: m });
        }

        const selectedItem = consumableItems[choice - 1];
        const inventoryItem = db.prepare('SELECT quantity FROM rpg_inventory WHERE user_jid = ? AND item_name = ?').get(jid, selectedItem.name);

        if (!inventoryItem || inventoryItem.quantity <= 0) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Kamu tidak punya *${selectedItem.name}*.` }, { quoted: m });
        }
        
        const consumableEffect = selectedItem.effect;
        let result = { type: consumableEffect.type };
        let finalMessage;
        
        if (consumableEffect.type === 'energy') {
            if (user.energy >= user.max_energy) {
                return await sock.sendMessage(m.key.remoteJid, { text: 'Energimu sudah penuh, tidak perlu konsumsi apa-apa lagi.' }, { quoted: m });
            }
            const newEnergy = Math.min(user.max_energy, user.energy + consumableEffect.value);
            result.gained = newEnergy - user.energy;
            result.newEnergy = newEnergy;
            finalMessage = selectedItem.message(result.gained);
        } else if (consumableEffect.type === 'money') {
            result.gained = Math.floor(Math.random() * (consumableEffect.max - consumableEffect.min + 1)) + consumableEffect.min;
            finalMessage = selectedItem.message(result.gained);
        }

        try {
            consumeTransaction(jid, selectedItem.name, result);
            await sock.sendMessage(m.key.remoteJid, { text: finalMessage }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal mengonsumsi item karena ada error.' }, { quoted: m });
        }
    }
};