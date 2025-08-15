/*
* Lokasi: src/lib/rpgUtils.js
* Versi: v2
*/

import db from '#database';

export function getPositionsWithDisplayId(user_jid) {
    return db.prepare("SELECT * FROM rpg_trading_positions WHERE user_jid = ? AND status = 'open' ORDER BY opened_at ASC").all(user_jid);
}

export const formatCoin = (number) => `${Math.floor(number).toLocaleString('id-ID')} 🪙`;