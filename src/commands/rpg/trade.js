/*
* Lokasi: src/commands/rpg/trade.js
* Versi: v2
*/

import db from '#database';
import logger from '#lib/logger.js';
import { getPositionsWithDisplayId } from '#lib/utils.js';
import { SUPPORTED_ASSETS } from '#lib/tradingSimulator.js';

const formatRupiah = (number) => `Rp ${Math.round(number).toLocaleString('id-ID')}`;

const closePositionByDisplayId = (user_jid, displayId) => {
    const positions = getPositionsWithDisplayId(user_jid);
    const positionToClose = positions[displayId - 1];

    if (!positionToClose) {
        return { success: false, message: 'ID posisi tidak ditemukan. Cek lagi ID-nya di `.trade positions`.' };
    }

    const { id: realDbId, asset_name } = positionToClose;
    
    const transaction = db.transaction(() => {
        const currentPrice = db.prepare('SELECT close FROM asset_price_history WHERE asset_name = ? ORDER BY timestamp DESC LIMIT 1').get(asset_name).close;
        const { type, entry_price, amount_invested } = positionToClose;
        
        const priceChange = currentPrice - entry_price;
        const pnlRatio = entry_price > 0 ? priceChange / entry_price : 0;
        let pnl = type === 'buy' ? Math.round(amount_invested * pnlRatio) : Math.round(amount_invested * -pnlRatio);
        
        const finalAmount = amount_invested + pnl;
        
        db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(finalAmount, user_jid);
        db.prepare("UPDATE rpg_trading_positions SET status = 'closed', closed_at = ?, pnl = ? WHERE id = ?").run(Math.floor(Date.now() / 1000), pnl, realDbId);
        
        return { pnl, amount: finalAmount };
    });

    try {
        const result = transaction();
        return { success: true, ...result };
    } catch (error) {
        logger.error({ err: error, user: user_jid }, 'Gagal transaksi penutupan posisi.');
        return { success: false, message: 'Terjadi error saat menutup posisi.' };
    }
};

export default {
    name: 'trade',
    category: 'rpg',
    description: 'Manajemen dan dokumentasi trading aset kripto di dunia RPG.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const user = db.prepare('SELECT money FROM rpg_users WHERE jid = ?').get(jid);
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum terdaftar di dunia RPG. Ketik `.register` dulu ya.' }, { quoted: m });
        }

        const [action, arg2] = args;

        switch (action?.toLowerCase()) {
            case 'positions': {
                const positions = getPositionsWithDisplayId(jid);
                if (positions.length === 0) {
                    return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu tidak punya posisi trading yang sedang terbuka.' }, { quoted: m });
                }
                
                const assetNames = [...new Set(positions.map(p => p.asset_name))];
                const currentPrices = {};
                for (const name of assetNames) {
                    const priceData = db.prepare('SELECT close FROM asset_price_history WHERE asset_name = ? ORDER BY timestamp DESC LIMIT 1').get(name);
                    if (priceData) {
                        currentPrices[name] = priceData.close;
                    }
                }
                
                let reply = '📊 *Posisi Trading Aktif Kamu:*\n\n';
                positions.forEach((p, index) => {
                    const displayId = index + 1;
                    const currentPrice = currentPrices[p.asset_name] || p.entry_price;
                    const pnlRatio = p.entry_price > 0 ? (currentPrice - p.entry_price) / p.entry_price : 0;
                    const pnl = p.type === 'buy' ? p.amount_invested * pnlRatio : p.amount_invested * -pnlRatio;
                    const pnlStatus = pnl >= 0 ? `🟢 Untung ${formatRupiah(pnl)}` : `🔴 Rugi ${formatRupiah(Math.abs(pnl))}`;
                    
                    reply += `*Posisi #${displayId}* | Aset: *${p.asset_name.toUpperCase()}* | Tipe: *${p.type.toUpperCase()}*\n`;
                    reply += `- Modal: ${formatRupiah(p.amount_invested)}\n`;
                    reply += `- Harga Masuk: ${formatRupiah(p.entry_price)}\n`;
                    reply += `- Harga Saat Ini: ${formatRupiah(currentPrice)}\n`;
                    reply += `- *Status P/L: ${pnlStatus}*\n\n`;
                });
                await sock.sendMessage(m.key.remoteJid, { text: reply.trim() }, { quoted: m });
                break;
            }
            case 'close': {
                const displayId = parseInt(arg2);
                if (isNaN(displayId) || displayId <= 0) {
                    return await sock.sendMessage(m.key.remoteJid, { text: 'ID posisi mana yang mau ditutup? Contoh: `.trade close 1`' }, { quoted: m });
                }
                
                const result = closePositionByDisplayId(jid, displayId);
                if (!result.success) {
                    return await sock.sendMessage(m.key.remoteJid, { text: result.message }, { quoted: m });
                }
                
                const pnlText = result.pnl >= 0 ? `Untung ${formatRupiah(result.pnl)}` : `Rugi ${formatRupiah(Math.abs(result.pnl))}`;
                await sock.sendMessage(m.key.remoteJid, { text: `✅ *Posisi #${displayId} Ditutup!*\n\nHasil: *${pnlText}*\nUang dikembalikan: *${formatRupiah(result.amount)}*` }, { quoted: m });
                break;
            }
            case 'history': {
                const history = db.prepare(`
                    SELECT asset_name, type, pnl, closed_at 
                    FROM rpg_trading_positions 
                    WHERE user_jid = ? AND status = 'closed'
                    ORDER BY closed_at DESC
                    LIMIT 5
                `).all(jid);

                if (history.length === 0) {
                    return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum punya riwayat transaksi trading.' }, { quoted: m });
                }

                let reply = '📜 *5 Riwayat Trading Terakhir Kamu:*\n\n';
                history.forEach((tx, index) => {
                    const pnlStatus = tx.pnl >= 0 ? `🟢 Untung ${formatRupiah(tx.pnl)}` : `🔴 Rugi ${formatRupiah(Math.abs(tx.pnl))}`;
                    const closeDate = new Date(tx.closed_at * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
                    reply += `*${index + 1}. [${tx.asset_name}] ${tx.type.toUpperCase()}* - ${pnlStatus}\n`;
                    reply += `   Ditutup: ${closeDate}\n\n`;
                });
                await sock.sendMessage(m.key.remoteJid, { text: reply.trim() }, { quoted: m });
                break;
            }
            default: {
                let assetListText = '';
                for (const assetKey in SUPPORTED_ASSETS) {
                    const asset = SUPPORTED_ASSETS[assetKey];
                    const priceData = db.prepare('SELECT close FROM asset_price_history WHERE asset_name = ? ORDER BY timestamp DESC LIMIT 1').get(assetKey);
                    assetListText += `› *${asset.name} (${assetKey})*: ${formatRupiah(priceData?.close || 0)}\n`;
                }

                const docText = `
*Selamat Datang di Pasar Kripto RPG!* 📈📉

Di sini kamu bisa untung besar dari pergerakan harga aset, tapi ingat, *risikonya juga besar!* Kamu bisa kehilangan semua modalmu.

💰 *Saldo Trading Kamu:* ${formatRupiah(user.money)}

---
*KONSEP DASAR*

🚀 *BUY (Long)*: Kamu untung jika harga aset *NAIK*.
💥 *SELL (Short)*: Kamu untung jika harga aset *TURUN*.

🎯 *Take Profit (TP)*: Target keuntungan. Posisi akan otomatis ditutup jika harga menyentuh target ini. Default: *10%*.
🛡️ *Stop Loss (SL)*: Batas kerugian. Posisi akan otomatis ditutup jika harga menyentuh batas ini untuk mencegah rugi lebih dalam. Default: *5%*.

---
*LANGKAH-LANGKAH TRADING*

1️⃣ *Cek Pasar & Grafik*
Lihat tren harga sebelum membuka posisi.
CONTOH: \`.grafik btc\`

2️⃣ *Buka Posisi (Trading)*
Gunakan nama aset sebagai perintah. Kamu bisa atur SL/TP sendiri.
SYNTAX: \`.<aset> <buy|sell> <jumlah_uang> [opsi]\`
CONTOH: \`.nkk buy 50000 sl=3 tp=15\`
_(Artinya: Buka posisi BUY NKK senilai 50rb, tutup jika rugi 3% atau untung 15%)_

3️⃣ *Pantau Posisimu*
Lihat semua posisimu yang sedang berjalan dan potensi untung/ruginya.
PERINTAH: \`.trade positions\`

4️⃣ *Tutup Posisi*
Kamu bisa menutup posisimu kapan saja secara manual.
PERINTAH: \`.trade close <id_posisi>\`
CONTOH: \`.trade close 1\`

5️⃣ *Lihat Riwayat*
Cek 5 transaksi terakhirmu yang sudah selesai.
PERINTAH: \`.trade history\`

Selamat mencoba peruntungan, Trader! 🚀
                `;
                await sock.sendMessage(m.key.remoteJid, { text: docText.trim() }, { quoted: m });
                break;
            }
        }
    }
};