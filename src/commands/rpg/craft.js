import db, { getRpgUser, rpgUserCache } from '#database';

const recipes = {
    'armor': {
        name: 'Armor Kulit',
        description: 'Memberikan perlindungan saat gagal merampok, mengurangi denda.',
        energyCost: 30,
        ingredients: { 'Kulit': 5, 'Tulang': 10 },
        successMessage: '🛡️ Kamu berhasil membuat *Armor Kulit*! Armor ini akan melindungimu dari denda penuh saat gagal merampok.'
    },
    'panah': {
        name: 'Panah Tulang',
        description: 'Meningkatkan jumlah hasil buruan saat berhasil.',
        energyCost: 15,
        ingredients: { 'Tulang': 8 },
        successMessage: '🏹 Kamu berhasil membuat *Panah Tulang*! Gunakan saat berburu untuk hasil yang lebih melimpah.'
    }
};

const craftItemTransaction = db.transaction((jid, recipe) => {
    const updateUserEnergy = db.prepare('UPDATE rpg_users SET energy = energy - ? WHERE jid = ?');
    const decrementIngredient = db.prepare('UPDATE rpg_inventory SET quantity = quantity - ? WHERE user_jid = ? AND item_name = ?');
    const upsertCraftedItem = db.prepare(`
        INSERT INTO rpg_inventory (user_jid, item_name, quantity) VALUES (?, ?, 1)
        ON CONFLICT(user_jid, item_name) DO UPDATE SET quantity = quantity + 1
    `);

    updateUserEnergy.run(recipe.energyCost, jid);
    for (const [name, qty] of Object.entries(recipe.ingredients)) {
        decrementIngredient.run(qty, jid, name);
    }
    upsertCraftedItem.run(jid, recipe.name);
});

export default {
    name: 'craft',
    category: 'rpg',
    description: 'Membuat item baru dari bahan yang ada.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const user = getRpgUser(jid);
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum terdaftar, bro. Ketik `.register` dulu ya.' }, { quoted: m });
        }

        const itemToCraft = args[0]?.toLowerCase();
        if (!itemToCraft) {
            let helpText = 'Mau buat apa? Pilih salah satu:\n\n';
            for (const [key, recipe] of Object.entries(recipes)) {
                helpText += `*${recipe.name}* (\`.craft ${key}\`)\n`;
                helpText += `  Bahan: ${Object.entries(recipe.ingredients).map(([name, qty]) => `${qty} ${name}`).join(', ')}\n`;
                helpText += `  Butuh: ${recipe.energyCost} Energi\n\n`;
            }
            return await sock.sendMessage(m.key.remoteJid, { text: helpText.trim() }, { quoted: m });
        }

        const recipe = recipes[itemToCraft];
        if (!recipe) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Item "${itemToCraft}" tidak bisa dibuat.` }, { quoted: m });
        }

        if (user.energy < recipe.energyCost) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Energimu tidak cukup. Butuh ${recipe.energyCost}, kamu cuma punya ${user.energy}.` }, { quoted: m });
        }

        const inventory = db.prepare('SELECT item_name, quantity FROM rpg_inventory WHERE user_jid = ?').all(jid);
        const userInventoryMap = new Map(inventory.map(i => [i.item_name, i.quantity]));

        const missingIngredients = [];
        for (const [name, requiredQty] of Object.entries(recipe.ingredients)) {
            if ((userInventoryMap.get(name) || 0) < requiredQty) {
                missingIngredients.push(`${requiredQty} ${name}`);
            }
        }

        if (missingIngredients.length > 0) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Bahan tidak cukup! Kamu butuh: ${missingIngredients.join(', ')}.` }, { quoted: m });
        }

        try {
            craftItemTransaction(jid, recipe);
            rpgUserCache.delete(jid);
            await sock.sendMessage(m.key.remoteJid, { text: recipe.successMessage }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, terjadi error saat membuat item.' }, { quoted: m });
        }
    }
};