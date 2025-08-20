import db, { getRpgUser, rpgUserCache } from '#database';

const COOK_COOLDOWN = 2 * 60 * 1000;

const recipes = {
    'daging_panggang': {
        name: 'Daging Panggang',
        description: 'Memulihkan 50 energi. Bekal penting untuk bertahan hidup.',
        energyCost: 5,
        ingredients: { 'Daging': 1 },
        successMessage: '🔥 Api unggun berderak saat kamu berhasil memasak *1 Daging Panggang*.'
    },
    'sup_ikan': {
        name: 'Sup Ikan Energi',
        description: 'Sup hangat yang memulihkan 100 energi.',
        energyCost: 20,
        ingredients: { 'Lele': 1, 'Tulang': 5 },
        successMessage: '🍲 Kamu berhasil meracik *Sup Ikan Energi*! Sepertinya sangat lezat dan berkhasiat.'
    },
    'sashimi': {
        name: 'Sashimi Keberuntungan',
        description: 'Potongan ikan segar yang katanya bisa membawa hoki.',
        energyCost: 15,
        ingredients: { 'Gurame': 1 },
        successMessage: '🍣 Kamu berhasil menyiapkan *Sashimi Keberuntungan*! Semoga hoki ya saat dimakan.'
    }
};

const cookItemTransaction = db.transaction((jid, recipe, now) => {
    db.prepare('UPDATE rpg_users SET energy = energy - ?, last_racik = ? WHERE jid = ?').run(recipe.energyCost, now, jid);
    
    const decrementIngredient = db.prepare('UPDATE rpg_inventory SET quantity = quantity - ? WHERE user_jid = ? AND item_name = ?');
    for (const [name, qty] of Object.entries(recipe.ingredients)) {
        decrementIngredient.run(qty, jid, name);
    }
    
    db.prepare(`
        INSERT INTO rpg_inventory (user_jid, item_name, quantity) VALUES (?, ?, 1)
        ON CONFLICT(user_jid, item_name) DO UPDATE SET quantity = quantity + 1
    `).run(jid, recipe.name);
    
    rpgUserCache.delete(jid);
});

export default {
    name: 'masak',
    aliases: ['racik', 'cook'],
    category: 'rpg',
    description: 'Memasak atau meracik item dari bahan mentah di inventaris.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const user = getRpgUser(jid);
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` dulu ya.' }, { quoted: m });
        }

        const itemToCraft = args[0]?.toLowerCase();
        if (!itemToCraft) {
            let helpText = 'Apa yang ingin kamu buat? Pilih dari resep yang kamu ketahui:\n\n';
            for (const [key, recipe] of Object.entries(recipes)) {
                helpText += `*${recipe.name}* (\`.masak ${key}\`)\n`;
                helpText += `  Bahan: ${Object.entries(recipe.ingredients).map(([name, qty]) => `${qty} ${name}`).join(', ')}\n`;
                helpText += `  Butuh: ${recipe.energyCost} Energi\n\n`;
            }
            return await sock.sendMessage(m.key.remoteJid, { text: helpText.trim() }, { quoted: m });
        }

        const recipe = recipes[itemToCraft];
        if (!recipe) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Resep untuk "${itemToCraft}" tidak ditemukan.` }, { quoted: m });
        }
        
        const now = Date.now();
        const timeSinceLastCook = now - (user.last_racik || 0);
        if (timeSinceLastCook < COOK_COOLDOWN) {
            const timeLeft = COOK_COOLDOWN - timeSinceLastCook;
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = ((timeLeft % 60000) / 1000).toFixed(0);
            return await sock.sendMessage(m.key.remoteJid, { text: `Kamu perlu istirahat sejenak. Tunggu *${minutes} menit ${seconds} detik* lagi sebelum memasak/meracik.` }, { quoted: m });
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
            cookItemTransaction(jid, recipe, now);
            await sock.sendMessage(m.key.remoteJid, { text: recipe.successMessage }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, terjadi error saat mencoba membuat item.' }, { quoted: m });
        }
    }
};