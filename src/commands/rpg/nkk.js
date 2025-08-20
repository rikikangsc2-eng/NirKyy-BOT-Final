import db from '#database';
import logger from '#lib/logger.js';
import { STOP_LOSS_PERCENT, TAKE_PROFIT_PERCENT } from '#lib/tradingSimulator.js';

const ASSET_NAME = 'NKK';
const DEFAULT_SL = STOP_LOSS_PERCENT * 100;
const DEFAULT_TP = TAKE_PROFIT_PERCENT * 100;
const BROKER_FEE_PERCENT = 0.01;

const formatRupiah = (number) => `Rp ${Math.round(number).toLocaleString('id-ID')}`;

const openPosition = db.transaction((user_jid, type, entry_price, amount, sl_percent, tp_percent) => {
    const sl_multiplier = sl_percent / 100;
    const tp_multiplier = tp_percent / 100;
    const fee = Math.round(amount * BROKER_FEE_PERCENT);

    const stop_loss_price = type === 'buy' ? entry_price * (1 - sl_multiplier) : entry_price * (1 + sl_multiplier);
    const take_profit_price = type === 'buy' ? entry_price * (1 + tp_multiplier) : entry_price * (1 - tp_multiplier);
    
    db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(amount + fee, user_jid);
    db.prepare(`
        INSERT INTO rpg_trading_positions (user_jid, asset_name, type, entry_price, amount_invested, stop_loss, take_profit, opened_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user_jid, ASSET_NAME, type, entry_price, amount, stop_loss_price, take_profit_price, Math.floor(Date.now() / 1000));
});

export default {
    name: 'nkk',
    aliases: ['nirkyykoin'],
    category: 'rpg',
    description: `Membuka posisi trading untuk aset ${ASSET_NAME}.`,
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const user = db.prepare('SELECT money FROM rpg_users WHERE jid = ?').get(jid);
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum terdaftar di dunia ini. Ketik `.register` dulu ya.' }, { quoted: m });
        }

        const [type, amountStr, ...options] = args;

        if (!['buy', 'sell'].includes(type?.toLowerCase())) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Tipe transaksinya apa? 'buy' atau 'sell'?\nContoh: \`.${this.name} buy 50000\`` }, { quoted: m });
        }

        const amount = parseInt(amountStr);
        if (isNaN(amount) || amount <= 0) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Jumlah koin yang mau dipertaruhkan berapa?\nContoh: \`.${this.name} ${type} 50000\`` }, { quoted: m });
        }

        const fee = Math.round(amount * BROKER_FEE_PERCENT);
        if (user.money < (amount + fee)) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Koinmu tidak cukup. Kamu butuh ${formatRupiah(amount)} + ${formatRupiah(fee)} (biaya broker) = ${formatRupiah(amount+fee)}.` }, { quoted: m });
        }

        let tp_percent = DEFAULT_TP;
        let sl_percent = DEFAULT_SL;

        options.forEach(opt => {
            const [key, value] = opt.split('=');
            const numValue = parseFloat(value);
            if (isNaN(numValue)) return;

            if (key.toLowerCase() === 'tp') tp_percent = numValue;
            if (key.toLowerCase() === 'sl') sl_percent = numValue;
        });

        try {
            const currentPrice = db.prepare('SELECT close FROM asset_price_history WHERE asset_name = ? ORDER BY timestamp DESC LIMIT 1').get(ASSET_NAME).close;
            
            openPosition(jid, type.toLowerCase(), currentPrice, amount, sl_percent, tp_percent);
            
            const slPrice = type.toLowerCase() === 'buy' ? currentPrice * (1 - (sl_percent / 100)) : currentPrice * (1 + (sl_percent / 100));
            const tpPrice = type.toLowerCase() === 'buy' ? currentPrice * (1 + (tp_percent / 100)) : currentPrice * (1 - (tp_percent / 100));
            
            const successMessage = `
✅ *Posisi ${ASSET_NAME} Berhasil Dibuka!*

Tipe: *${type.toUpperCase()}*
Modal: *${formatRupiah(amount)}*
Biaya Broker: *${formatRupiah(fee)}*
Harga Masuk: *${formatRupiah(currentPrice)}*

*Target Otomatis:*
- Take Profit: ~${formatRupiah(tpPrice)} (*+${tp_percent}%*)
- Stop Loss: ~${formatRupiah(slPrice)} (*-${sl_percent}%*)

Ketik \`.trade positions\` untuk melihat status.
            `;
            await sock.sendMessage(m.key.remoteJid, { text: successMessage.trim() }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, user: jid }, `Gagal membuka posisi ${ASSET_NAME}`);
            await sock.sendMessage(m.key.remoteJid, { text: `Waduh, ada error saat membuka posisi. Coba lagi nanti.` }, { quoted: m });
        }
    }
};