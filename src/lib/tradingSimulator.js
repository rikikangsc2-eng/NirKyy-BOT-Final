/*
 * Lokasi: src/lib/tradingSimulator.js
 * Versi: v2
 */

import db from '#database';
import logger from './logger.js';

const selectLastCloseStmt = db.prepare(
    'SELECT close FROM asset_price_history WHERE asset_name = ? ORDER BY timestamp DESC LIMIT 1'
);
const insertCandleStmt = db.prepare(
    'INSERT INTO asset_price_history (asset_name, timestamp, open, high, low, close) VALUES (?, ?, ?, ?, ?, ?)'
);
const deleteOldStmt = db.prepare(
    'DELETE FROM asset_price_history WHERE asset_name = ? AND id NOT IN (SELECT id FROM asset_price_history WHERE asset_name = ? ORDER BY timestamp DESC LIMIT ?)'
);

const UPDATE_INTERVAL = 5 * 60 * 1000;
const MAX_HISTORY_RECORDS = 200;
let activeSocket = null;

export const SUPPORTED_ASSETS = {
    'BTC': { name: 'Bitcoin', initialPrice: 1000000000, volatility: 0.025 },
    'NKK': { name: 'NirKyy Koin', initialPrice: 50000, volatility: 0.1 }
};

export const STOP_LOSS_PERCENT = 0.05;
export const TAKE_PROFIT_PERCENT = 0.10;
export { UPDATE_INTERVAL };

let simulatorIntervalId = null;
const formatRupiah = (number) => `Rp ${Math.round(number).toLocaleString('id-ID')}`;

const generateNewCandle = (lastPrice, initialPrice, volatility) => {
    const meanReversionStrength = 0.05;

    const reversionPull = (initialPrice - lastPrice) * meanReversionStrength;
    const randomFluctuation = (Math.random() - 0.5) * 2 * volatility * lastPrice;
    
    const change = reversionPull + randomFluctuation;
    const newClose = Math.max(1, lastPrice + change);

    const open = lastPrice;
    const high = Math.max(open, newClose) + (Math.random() * volatility * 0.5 * lastPrice);
    const low = Math.min(open, newClose) - (Math.random() * volatility * 0.5 * lastPrice);

    return {
        timestamp: Math.floor(Date.now() / 1000),
        open: Math.round(open),
        high: Math.round(Math.max(1, high)),
        low: Math.round(Math.max(1, low)),
        close: Math.round(newClose)
    };
};

const updateAssetPrices = db.transaction(() => {
    for (const assetName in SUPPORTED_ASSETS) {
        const lastRecord = selectLastCloseStmt.get(assetName);
        if (!lastRecord) {
            logger.warn(`Tidak ada data harga untuk ${assetName}, inisialisasi dengan harga dasar.`);
            const initialCandle = {
                timestamp: Math.floor(Date.now() / 1000),
                open: SUPPORTED_ASSETS[assetName].initialPrice,
                high: SUPPORTED_ASSETS[assetName].initialPrice,
                low: SUPPORTED_ASSETS[assetName].initialPrice,
                close: SUPPORTED_ASSETS[assetName].initialPrice
            };
            insertCandleStmt.run(assetName, initialCandle.timestamp, initialCandle.open, initialCandle.high, initialCandle.low, initialCandle.close);
            continue;
        }
        
        const assetInfo = SUPPORTED_ASSETS[assetName];
        const newCandle = generateNewCandle(lastRecord.close, assetInfo.initialPrice, assetInfo.volatility);
        
        insertCandleStmt.run(
            assetName, newCandle.timestamp, newCandle.open, newCandle.high, newCandle.low, newCandle.close
        );
        deleteOldStmt.run(assetName, assetName, MAX_HISTORY_RECORDS);
    }
});

const checkAndClosePositionsForAsset = db.transaction((assetName, currentPrice) => {
    const closedPositions = [];
    const now = Math.floor(Date.now() / 1000);

    const buyTriggered = db.prepare(
        `SELECT * FROM rpg_trading_positions 
         WHERE status = 'open' AND asset_name = ? AND type = 'buy' AND (stop_loss >= ? OR take_profit <= ?)`
    ).all(assetName, currentPrice, currentPrice);

    const sellTriggered = db.prepare(
        `SELECT * FROM rpg_trading_positions 
         WHERE status = 'open' AND asset_name = ? AND type = 'sell' AND (stop_loss <= ? OR take_profit >= ?)`
    ).all(assetName, currentPrice, currentPrice);

    const allTriggered = [...buyTriggered, ...sellTriggered];
    if (allTriggered.length === 0) return closedPositions;

    const updateUserMoney = db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?');
    const updatePosition  = db.prepare("UPDATE rpg_trading_positions SET status = 'closed', closed_at = ?, pnl = ? WHERE id = ?");

    for (const pos of allTriggered) {
        const pnlRatio = pos.entry_price > 0
            ? (currentPrice - pos.entry_price) / pos.entry_price : 0;
        const pnl = pos.type === 'buy'
            ? Math.round(pos.amount_invested * pnlRatio)
            : Math.round(pos.amount_invested * -pnlRatio);
        const finalAmount = pos.amount_invested + pnl;
        const triggerType = (pos.type === 'buy'
            ? (currentPrice <= pos.stop_loss)
            : (currentPrice >= pos.stop_loss))
            ? 'Stop Loss' : 'Take Profit';

        updateUserMoney.run(finalAmount, pos.user_jid);
        updatePosition.run(now, pnl, pos.id);

        closedPositions.push({
            user_jid: pos.user_jid,
            asset_name: pos.asset_name,
            pnl, finalAmount, triggerType
        });
    }
    return closedPositions;
});

async function checkAllActivePositions() {
    if (!activeSocket) return;
    for (const assetName in SUPPORTED_ASSETS) {
        try {
            const priceRecord = selectLastCloseStmt.get(assetName);
            if (!priceRecord) continue;
            const closedPositions = checkAndClosePositionsForAsset(assetName, priceRecord.close);

            for (const pos of closedPositions) {
                const pnlText = pos.pnl >= 0
                    ? `  Untung *${formatRupiah(pos.pnl)}*`
                    : `  Rugi *${formatRupiah(Math.abs(pos.pnl))}*`;
                const message = `  *Posisi Trading Ditutup Otomatis!*  \n\n` +
                    `Posisi *${pos.asset_name.toUpperCase()}* Anda telah ditutup karena mencapai ` +
                    `target *${pos.triggerType}*.\n\n*Hasil Transaksi:*\n- Status: ${pnlText}\n- ` +
                    `Uang kembali ke saldo: *${formatRupiah(pos.finalAmount)}*\n\n` +
                    `Cek saldo Anda dengan \`.inv\`.`;
                
                try {
                    await activeSocket.sendMessage(pos.user_jid, { text: message.trim() });
                } catch (e) {
                    logger.error({ err: e, user: pos.user_jid }, 
                        "Gagal mengirim notifikasi penutupan posisi otomatis.");
                }
            }
        } catch (error) {
            logger.error({ err: error, asset: assetName }, 
                `Gagal memeriksa posisi untuk aset ${assetName}.`);
        }
    }
}

function start(sock) {
    if (simulatorIntervalId) {
        logger.warn('Simulator trading sudah berjalan, permintaan start baru diabaikan.');
        return;
    }
    activeSocket = sock;
    logger.info('Simulator Trading Multi-Aset diaktifkan.');
    simulatorIntervalId = setInterval(() => {
        try {
            updateAssetPrices();
            checkAllActivePositions();
        } catch (error) {
            logger.error({ err: error }, 'Error dalam interval utama simulator trading.');
        }
    }, UPDATE_INTERVAL);
}

export { start };