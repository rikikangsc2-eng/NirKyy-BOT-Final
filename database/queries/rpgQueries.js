/*
* Lokasi: database/queries/rpgQueries.js
* Versi: v2
*/

export default (db) => ({
    getRpgUser: db.prepare('SELECT * FROM rpg_users WHERE jid = ?'),
    getUserByName: db.prepare('SELECT jid, name FROM rpg_users WHERE name = ?'),
    deleteRpgUser: db.prepare('DELETE FROM rpg_users WHERE jid = ?'),
    getRpgInventory: db.prepare('SELECT item_name, quantity FROM rpg_inventory WHERE user_jid = ? AND quantity > 0 ORDER BY item_name ASC'),
    getAllRpgUsers: db.prepare('SELECT * FROM rpg_users'),
    getOpenTradingPositions: db.prepare("SELECT * FROM rpg_trading_positions WHERE user_jid = ? AND status = 'open' ORDER BY opened_at ASC"),
    getTradingPositionsByAsset: db.prepare("SELECT * FROM rpg_trading_positions WHERE status = 'open' AND asset_name = ?"),
    updateUserMoney: db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?'),
    updatePositionStatus: db.prepare("UPDATE rpg_trading_positions SET status = 'closed', closed_at = ?, pnl = ? WHERE id = ?"),
    getLastPrice: db.prepare('SELECT close FROM asset_price_history WHERE asset_name = ? ORDER BY timestamp DESC LIMIT 1')
});