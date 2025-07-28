import db, { getRpgUser, rpgUserCache } from '#database';

const itemPrices = {
    'Daging': 1200,
    'Tulang': 600,
    'Kulit': 3000,
    'Ikan Mas': 650,
    'Lele': 800,
    'Gurame': 2500,
    'Sepatu Bot Bekas': 50
};

const sellItemsTransaction = db.transaction((jid, itemName, quantity, totalPrice) => {
    db.prepare('UPDATE rpg_inventory SET quantity = quantity - ? WHERE user_jid = ? AND item_name = ?').run(quantity, jid, itemName);
    db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(totalPrice, jid);
});

export default {
    name: 'sell',
    aliases: ['jual'],
    category: 'rpg',
    description: 'Jual item dari inventaris untuk mendapatkan uang.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const user = getRpgUser(jid);
        
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum terdaftar, bro. Ketik `.register` dulu ya.' }, { quoted: m });
        }

        const [choiceStr, quantityInput] = args;

        const inventory = db.prepare('SELECT item_name, quantity FROM rpg_inventory WHERE user_jid = ? AND quantity > 0').all(jid);
        const sellableItems = inventory.filter(item => itemPrices[item.item_name]);

        if (!choiceStr) {
            if (sellableItems.length === 0) {
                return await sock.sendMessage(m.key.remoteJid, { text: 'Kantungmu kosong, tidak ada barang yang bisa dijual.' }, { quoted: m });
            }
            let listText = 'Pilih barang yang ingin kamu jual:\n\n';
            sellableItems.forEach((item, index) => {
                listText += `*${index + 1}. ${item.item_name}* (Punya: ${item.quantity})\n`;
                listText += `   └ Harga: ${itemPrices[item.item_name].toLocaleString('id-ID')} 🪙 / pcs\n\n`;
            });
            listText += "Ketik `.jual <nomor> <jumlah|all>` untuk menjual.";
            return await sock.sendMessage(m.key.remoteJid, { text: listText.trim() }, { quoted: m });
        }
        
        const choice = parseInt(choiceStr, 10);
        if (isNaN(choice) || choice < 1 || choice > sellableItems.length) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Pilihan tidak valid. Pilih nomor dari daftar `.jual`.' }, { quoted: m });
        }

        const itemToSell = sellableItems[choice - 1];
        const canonicalItemName = itemToSell.item_name;
        
        let quantityToSell;
        if (quantityInput?.toLowerCase() === 'all') {
            quantityToSell = itemToSell.quantity;
        } else {
            quantityToSell = parseInt(quantityInput, 10);
        }

        if (isNaN(quantityToSell) || quantityToSell <= 0) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Jumlah yang dimasukkan tidak valid. Gunakan angka atau "all".' }, { quoted: m });
        }

        if (quantityToSell > itemToSell.quantity) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Jumlah melebihi stok. Kamu hanya punya *${itemToSell.quantity} ${canonicalItemName}*.` }, { quoted: m });
        }

        const pricePerItem = itemPrices[canonicalItemName];
        const totalPrice = pricePerItem * quantityToSell;

        try {
            sellItemsTransaction(jid, canonicalItemName, quantityToSell, totalPrice);
            rpgUserCache.delete(jid);
            
            const formattedPrice = totalPrice.toLocaleString('id-ID');
            await sock.sendMessage(m.key.remoteJid, { text: `✅ Berhasil menjual *${quantityToSell} ${canonicalItemName}* seharga ${formattedPrice} 🪙!` }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Gagal menjual item karena ada error di database.' }, { quoted: m });
        }
    }
};