import db, { getRpgUser, rpgUserCache } from '#database';

const formatToRupiah = (number) => `${number.toLocaleString('id-ID')} 🪙`;

const bankTransaction = db.transaction((jid, amount, type) => {
    if (type === 'deposit') {
        db.prepare('UPDATE rpg_users SET money = money - ?, bank_balance = bank_balance + ? WHERE jid = ?').run(amount, amount, jid);
    } else if (type === 'withdraw') {
        db.prepare('UPDATE rpg_users SET money = money + ?, bank_balance = bank_balance - ? WHERE jid = ?').run(amount, amount, jid);
    }
    rpgUserCache.delete(jid);
});

export default {
    name: 'bank',
    category: 'rpg',
    description: 'Menyimpan atau mengambil koin dari Guild Vault.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const user = getRpgUser(jid);

        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` dulu ya.' }, { quoted: m });
        }

        const action = args[0]?.toLowerCase();
        const amountStr = args[1];

        if (!action) {
            const statusMessage = `*Status Guild Vault*\n\n- Koin di Kantung: ${formatToRupiah(user.money)}\n- Simpanan di Vault: ${formatToRupiah(user.bank_balance)}\n\nKetik \`.bank deposit <jumlah>\` atau \`.bank withdraw <jumlah>\`.`;
            return await sock.sendMessage(m.key.remoteJid, { text: statusMessage }, { quoted: m });
        }

        if (!['deposit', 'withdraw'].includes(action)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah tidak valid. Gunakan `deposit` (simpan) atau `withdraw` (ambil).' }, { quoted: m });
        }

        if (!amountStr) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Berapa jumlah koinnya? Contoh: \`.bank ${action} 1000\`` }, { quoted: m });
        }
        
        let amount;
        if (action === 'deposit') {
            amount = amountStr.toLowerCase() === 'all' ? user.money : parseInt(amountStr, 10);
            if (isNaN(amount) || amount <= 0) return await sock.sendMessage(m.key.remoteJid, { text: 'Jumlah tidak valid.' }, { quoted: m });
            if (amount > user.money) return await sock.sendMessage(m.key.remoteJid, { text: `Koin di kantungmu tidak cukup. Kamu hanya punya ${formatToRupiah(user.money)}.` }, { quoted: m });
        } else {
            amount = amountStr.toLowerCase() === 'all' ? user.bank_balance : parseInt(amountStr, 10);
            if (isNaN(amount) || amount <= 0) return await sock.sendMessage(m.key.remoteJid, { text: 'Jumlah tidak valid.' }, { quoted: m });
            if (amount > user.bank_balance) return await sock.sendMessage(m.key.remoteJid, { text: `Simpanan di vault tidak cukup. Kamu hanya punya ${formatToRupiah(user.bank_balance)}.` }, { quoted: m });
        }

        try {
            bankTransaction(jid, amount, action);
            const actionText = action === 'deposit' ? 'disimpan ke' : 'diambil dari';
            await sock.sendMessage(m.key.remoteJid, { text: `✅ Berhasil! Sejumlah ${formatToRupiah(amount)} telah ${actionText} Guild Vault.` }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Transaksi dengan Guild Vault gagal karena gangguan misterius.' }, { quoted: m });
        }
    }
};