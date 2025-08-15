/*
* Lokasi: src/commands/rpg/grafik.js
* Versi: v2
*/

import db from '#database';
import logger from '#lib/logger.js';
import { getChartImage } from '#lib/chartGenerator.js';
import { getPositionsWithDisplayId } from '#lib/utils.js';
import { SUPPORTED_ASSETS, UPDATE_INTERVAL } from '#lib/tradingSimulator.js';

const formatRupiah = (number) => `Rp ${Math.round(number).toLocaleString('id-ID')}`;

function getNextCandleCountdown() {
    const now = Date.now();
    const timeLeft = UPDATE_INTERVAL - (now % UPDATE_INTERVAL);
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

export default {
    name: 'grafik',
    aliases: ['chart'],
    category: 'rpg',
    description: 'Menampilkan grafik harga aset atau posisi trading.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const arg = args[0];

        if (!arg) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Mau lihat grafik apa? Coba ketik `.grafik btc` atau `.grafik <id_posisi>`.' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: `Sip, lagi nyiapin grafik untuk *${arg.toUpperCase()}*... 🎨` }, { quoted: m });

        const positionId = parseInt(arg);
        if (!isNaN(positionId)) {
            const positions = getPositionsWithDisplayId(jid);
            const position = positions[positionId - 1];

            if (!position) {
                return await sock.sendMessage(m.key.remoteJid, { text: `ID Posisi #${positionId} tidak ditemukan. Cek lagi di \`.trade positions\`.` }, { quoted: m });
            }

            const annotations = {
                entry: { price: position.entry_price, type: position.type },
                sl: position.stop_loss,
                tp: position.take_profit,
            };
            const chartResult = await getChartImage(position.asset_name, annotations);

            if (!chartResult || !chartResult.chartBuffer) {
                return await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal membuat grafik posisi. Coba lagi nanti.' }, { quoted: m });
            }

            const currentPrice = db.prepare('SELECT close FROM asset_price_history WHERE asset_name = ? ORDER BY timestamp DESC LIMIT 1').get(position.asset_name)?.close || position.entry_price;
            const pnlRatio = position.entry_price > 0 ? (currentPrice - position.entry_price) / position.entry_price : 0;
            const pnl = position.type === 'buy' ? position.amount_invested * pnlRatio : position.amount_invested * -pnlRatio;
            const pnlStatus = pnl >= 0 ? `🟢 Untung ${formatRupiah(pnl)}` : `🔴 Rugi ${formatRupiah(Math.abs(pnl))}`;

            const caption = `
*Grafik Posisi #${positionId} | ${position.asset_name.toUpperCase()}*

- Tipe: *${position.type.toUpperCase()}*
- Modal: *${formatRupiah(position.amount_invested)}*
- Harga Masuk: *${formatRupiah(position.entry_price)}*
- Harga Saat Ini: *${formatRupiah(currentPrice)}*
- Status P/L: *${pnlStatus}*

🕯️ _Candle baru dalam: ${getNextCandleCountdown()}_
            `;
            await sock.sendMessage(m.key.remoteJid, { image: chartResult.chartBuffer, caption: caption.trim() }, { quoted: m });

        } else {
            const assetName = arg.toUpperCase();
            if (!SUPPORTED_ASSETS[assetName]) {
                return await sock.sendMessage(m.key.remoteJid, { text: `Aset *${assetName}* tidak dikenal. Pilih: ${Object.keys(SUPPORTED_ASSETS).join(', ')}.` }, { quoted: m });
            }

            const chartResult = await getChartImage(assetName);

            if (!chartResult || !chartResult.chartBuffer) {
                return await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal membuat grafik pasar. Coba lagi nanti.' }, { quoted: m });
            }
            
            const priceData = chartResult.priceData;
            const lastPrice = priceData.length > 0 ? priceData[priceData.length - 1].close : 0;
            const prevPrice = priceData.length > 1 ? priceData[priceData.length - 2].close : lastPrice;
            const change = lastPrice - prevPrice;
            const changePercent = prevPrice > 0 ? (change / prevPrice) * 100 : 0;
            const changeIcon = change >= 0 ? '📈' : '📉';

             const caption = `
*${SUPPORTED_ASSETS[assetName].name} (${assetName}/IDR) Market* ${changeIcon}

Harga Saat Ini: *${formatRupiah(lastPrice)}*
Perubahan (1m): ${formatRupiah(change)} (${changePercent.toFixed(2)}%)

🕯️ _Candle baru dalam: ${getNextCandleCountdown()}_
            `;
            await sock.sendMessage(m.key.remoteJid, { image: chartResult.chartBuffer, caption: caption.trim() }, { quoted: m });
        }
    }
};