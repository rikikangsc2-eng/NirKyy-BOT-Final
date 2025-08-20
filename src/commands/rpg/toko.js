import db, { getRpgUser, rpgUserCache } from '#database';

const shopItems = {
    'eliksir_kecil': {
        name: 'Eliksir Energi Kecil',
        price: 5000,
        description: 'Memulihkan 40 energi. Cairan magis untuk kondisi darurat.',
        db_item_name: 'Eliksir Energi Kecil'
    }
};

const buyTransaction = db.transaction((jid, item, quantity, totalPrice) => {
    db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(totalPrice, jid);
    const upsertStmt = db.prepare(`
        INSERT INTO rpg_inventory (user_jid, item_name, quantity) VALUES (?, ?, ?)
        ON CONFLICT(user_jid, item_name) DO UPDATE SET quantity = quantity + excluded.quantity
    `);
    upsertStmt.run(jid, item.db_item_name, quantity);
    rpgUserCache.delete(jid);
});

export default {
    name: 'toko',
    aliases: ['shop'],
    category: 'rpg',
    description: 'Beli barang-barang penting untuk bertahan hidup di Arcadia.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const user = getRpgUser(jid);
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` dulu ya.' }, { quoted: m });
        }

        const [action, itemKey, quantityStr] = args.map(arg => arg?.toLowerCase());

        if (!action) {
            let shopText = 'Selamat datang di Toko Darurat Arcadia.\n_Saat ini, toko sedang kosong dan menunggu pasokan baru._\n\n';
            if (Object.keys(shopItems).length > 0) {
                shopText = 'Selamat datang di Toko Darurat Arcadia.\n_Hanya barang paling vital yang tersedia._\n\n';
                 for (const [key, item] of Object.entries(shopItems)) {
                    shopText += `› *${item.name}* - ${item.price} 🪙\n  \`(.toko buy ${key} <jumlah>)\`\n  *Efek:* ${item.description}\n\n`;
                }
            }
            shopText += `Koin kamu: ${user.money.toLocaleString('id-ID')} 🪙`;
            return await sock.sendMessage(m.key.remoteJid, { text: shopText.trim() }, { quoted: m });
        }

        if (action !== 'buy') {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah tidak dikenal. Gunakan `.toko buy <item> <jumlah>`.' }, { quoted: m });
        }
        
        const itemToBuy = shopItems[itemKey];
        if (!itemToBuy) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Barang dengan nama "${itemKey}" tidak ditemukan di toko.` }, { quoted: m });
        }
        
        const quantity = parseInt(quantityStr, 10);
        if (isNaN(quantity) || quantity <= 0) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Jumlah pembelian tidak valid. Harap masukkan angka. Contoh: \`.toko buy ${itemKey} 5\`` }, { quoted: m });
        }

        const totalPrice = itemToBuy.price * quantity;
        if (user.money < totalPrice) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Koin tidak cukup. Kamu butuh ${totalPrice} 🪙, tapi hanya punya ${user.money} 🪙.` }, { quoted: m });
        }

        try {
            buyTransaction(jid, itemToBuy, quantity, totalPrice);
            await sock.sendMessage(m.key.remoteJid, { text: `✅ Berhasil membeli *${quantity} ${itemToBuy.name}* seharga ${totalPrice} 🪙.` }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Transaksi gagal karena gangguan misterius.' }, { quoted: m });
        }
    }
};