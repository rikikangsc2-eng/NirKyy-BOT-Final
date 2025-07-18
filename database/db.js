import Database from 'better-sqlite3';
import { LRUCache } from 'lru-cache';
import config from '#config';

const db = new Database(config.databaseName);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = 1');
db.pragma('busy_timeout = 5000');
db.exec(`
    CREATE TABLE IF NOT EXISTS groups ( groupId TEXT PRIMARY KEY, welcome_enabled BOOLEAN DEFAULT 0, welcome_message TEXT DEFAULT 'Selamat datang @user di grup @subject!', antilink_enabled BOOLEAN DEFAULT 0 );
    CREATE TABLE IF NOT EXISTS users ( jid TEXT PRIMARY KEY, last_interaction INTEGER, limit_usage INTEGER DEFAULT 0, last_limit_reset INTEGER, is_premium BOOLEAN DEFAULT 0, premium_expires_at INTEGER );
    CREATE TABLE IF NOT EXISTS afk_users ( jid TEXT PRIMARY KEY, reason TEXT, afk_since INTEGER NOT NULL );
    CREATE TABLE IF NOT EXISTS afk_mentions ( id INTEGER PRIMARY KEY AUTOINCREMENT, afk_user_jid TEXT NOT NULL, mentioner_jid TEXT NOT NULL, mentioner_name TEXT, chat_jid TEXT NOT NULL, message_text TEXT, message_timestamp INTEGER NOT NULL );
    CREATE TABLE IF NOT EXISTS ai_history ( userId TEXT PRIMARY KEY, history TEXT NOT NULL );
    CREATE TABLE IF NOT EXISTS rpg_users ( jid TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT, age INTEGER, money INTEGER DEFAULT 0, bank_balance INTEGER DEFAULT 0, last_hunt INTEGER DEFAULT 0, last_rob INTEGER DEFAULT 0, last_work INTEGER DEFAULT 0, last_fish INTEGER DEFAULT 0, last_racik INTEGER DEFAULT 0, energy INTEGER DEFAULT 100, max_energy INTEGER DEFAULT 100, last_beg INTEGER DEFAULT 0 );
    CREATE TABLE IF NOT EXISTS rpg_inventory ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT NOT NULL, item_name TEXT NOT NULL, quantity INTEGER NOT NULL, FOREIGN KEY (user_jid) REFERENCES rpg_users (jid) ON DELETE CASCADE, UNIQUE(user_jid, item_name) );
    CREATE TABLE IF NOT EXISTS asset_price_history ( id INTEGER PRIMARY KEY AUTOINCREMENT, asset_name TEXT NOT NULL, timestamp INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL );
    CREATE TABLE IF NOT EXISTS rpg_trading_positions ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT NOT NULL, asset_name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('buy', 'sell')), entry_price REAL NOT NULL, amount_invested INTEGER NOT NULL, stop_loss REAL, take_profit REAL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')), opened_at INTEGER NOT NULL, closed_at INTEGER, pnl INTEGER, FOREIGN KEY (user_jid) REFERENCES rpg_users (jid) ON DELETE CASCADE );
    CREATE TABLE IF NOT EXISTS group_user_stats ( group_id TEXT NOT NULL, user_jid TEXT NOT NULL, message_count INTEGER DEFAULT 1, PRIMARY KEY (group_id, user_jid) );
    CREATE TABLE IF NOT EXISTS group_lists ( group_id TEXT NOT NULL, list_key TEXT NOT NULL, list_value TEXT NOT NULL, PRIMARY KEY (group_id, list_key) );
`);

try {
    const columns = db.prepare("PRAGMA table_info(rpg_users)").all();
    if (!columns.some(col => col.name === 'last_fish')) {
        db.exec("ALTER TABLE rpg_users ADD COLUMN last_fish INTEGER DEFAULT 0");
    }
    if (!columns.some(col => col.name === 'last_racik')) {
        db.exec("ALTER TABLE rpg_users ADD COLUMN last_racik INTEGER DEFAULT 0");
    }
    if (!columns.some(col => col.name === 'max_energy')) {
        db.exec("ALTER TABLE rpg_users ADD COLUMN max_energy INTEGER DEFAULT 100");
    }
    if (!columns.some(col => col.name === 'last_beg')) {
        db.exec("ALTER TABLE rpg_users ADD COLUMN last_beg INTEGER DEFAULT 0");
    }
} catch (error) {
    console.error('Gagal menjalankan migrasi database untuk rpg_users:', error);
}

console.log('Koneksi dan skema database siap.');

export const groupSettingsCache = new LRUCache({ max: 500, ttl: 1000 * 60 * 30 });
export const rpgUserCache       = new LRUCache({ max: 300, ttl: 1000 * 60 * 5 });
export const userLimitCache     = new LRUCache({ max: 500, ttl: 1000 * 60 * 2 });
export const afkUserCache       = new LRUCache({ max: 300, ttl: 1000 * 60 * 2 });
export const susunkataSessions  = new LRUCache({ max: 100, ttl: 1000 * 60 * 5 });
export const susunkataDataCache = new LRUCache({ max: 1, ttl: 1000 * 60 * 60 });
export const tictactoeSessions  = new LRUCache({ max: 100, ttl: 1000 * 60 * 15 });

const _statements = {
    getGroupSettings: db.prepare('SELECT antilink_enabled, welcome_enabled, welcome_message FROM groups WHERE groupId = ?'),
    upsertGroupSettings: db.prepare(`INSERT INTO groups (groupId, antilink_enabled, welcome_enabled, welcome_message) VALUES (@groupId, @antilink, @welcome_en, @welcome_msg) ON CONFLICT(groupId) DO UPDATE SET antilink_enabled = COALESCE(excluded.antilink_enabled, antilink_enabled), welcome_enabled = COALESCE(excluded.welcome_enabled, welcome_enabled), welcome_message = COALESCE(excluded.welcome_message, welcome_message)`),
    getAfkUser: db.prepare('SELECT jid, reason, afk_since FROM afk_users WHERE jid = ?'),
    getAfkMentions: db.prepare('SELECT mentioner_jid, mentioner_name, message_text FROM afk_mentions WHERE afk_user_jid = ? ORDER BY message_timestamp ASC'),
    deleteAfkUser: db.prepare('DELETE FROM afk_users WHERE jid = ?'),
    deleteAfkMentions: db.prepare('DELETE FROM afk_mentions WHERE afk_user_jid = ?'),
    insertAfkUser: db.prepare('INSERT INTO afk_users (jid, reason, afk_since) VALUES (?, ?, ?) ON CONFLICT(jid) DO UPDATE SET reason = excluded.reason, afk_since = excluded.afk_since'),
    insertAfkMention: db.prepare('INSERT INTO afk_mentions (afk_user_jid, mentioner_jid, mentioner_name, chat_jid, message_text, message_timestamp) VALUES (?, ?, ?, ?, ?, ?)'),
    getUserForLimiting: db.prepare('SELECT jid, limit_usage, last_limit_reset, is_premium, premium_expires_at FROM users WHERE jid = ?'),
    upsertUserForLimiting: db.prepare('INSERT INTO users (jid) VALUES (?) ON CONFLICT(jid) DO NOTHING'),
    updateUserLimit: db.prepare('UPDATE users SET limit_usage = limit_usage + 1 WHERE jid = ?'),
    resetUserLimit: db.prepare('UPDATE users SET limit_usage = 0, last_limit_reset = ? WHERE jid = ?'),
    setPremium: db.prepare('INSERT INTO users (jid, is_premium, premium_expires_at) VALUES (?, 1, ?) ON CONFLICT(jid) DO UPDATE SET is_premium = 1, premium_expires_at = excluded.premium_expires_at'),
    removePremium: db.prepare('UPDATE users SET is_premium = 0, premium_expires_at = NULL WHERE jid = ?'),
    getUserLastInteraction: db.prepare('SELECT last_interaction FROM users WHERE jid = ?'),
    updateUserInteraction: db.prepare('INSERT INTO users (jid, last_interaction) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET last_interaction = excluded.last_interaction;'),
    getRpgUser: db.prepare('SELECT * FROM rpg_users WHERE jid = ?'),
    getRpgInventory: db.prepare('SELECT item_name, quantity FROM rpg_inventory WHERE user_jid = ? AND quantity > 0 ORDER BY item_name ASC'),
    getAiHistory: db.prepare('SELECT history FROM ai_history WHERE userId = ?'),
    updateAiHistory: db.prepare('INSERT INTO ai_history (userId, history) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET history = excluded.history;'),
    deleteAiHistory: db.prepare('DELETE FROM ai_history WHERE userId = ?'),
    incrementMessageCount: db.prepare('INSERT INTO group_user_stats (group_id, user_jid) VALUES (?, ?) ON CONFLICT(group_id, user_jid) DO UPDATE SET message_count = message_count + 1'),
    getTopChatters: db.prepare('SELECT user_jid, message_count FROM group_user_stats WHERE group_id = ? ORDER BY message_count DESC LIMIT 10'),
    setGroupListItem: db.prepare('INSERT INTO group_lists (group_id, list_key, list_value) VALUES (@groupId, @key, @value) ON CONFLICT(group_id, list_key) DO UPDATE SET list_value = excluded.list_value'),
    getGroupListItem: db.prepare('SELECT list_value FROM group_lists WHERE group_id = ? AND list_key = ?'),
    deleteGroupListItem: db.prepare('DELETE FROM group_lists WHERE group_id = ? AND list_key = ?'),
    getAllGroupListItems: db.prepare('SELECT list_key FROM group_lists WHERE group_id = ? ORDER BY list_key ASC'),
};
export const statements = _statements;

function createCachedGet(cache, statement) {
    return (key) => {
        if (!key) return null;
        if (cache.has(key)) return cache.get(key);
        const result = statement.get(key);
        if (result) cache.set(key, result);
        return result;
    };
}

export const getGroupSettings = createCachedGet(groupSettingsCache, _statements.getGroupSettings);
export const getRpgUser      = createCachedGet(rpgUserCache, _statements.getRpgUser);
export const getAfkUser      = createCachedGet(afkUserCache, _statements.getAfkUser);

export function getUserForLimiting(jid) {
    if (userLimitCache.has(jid)) {
        const cachedUser = userLimitCache.get(jid);
        const today = new Date().setHours(0, 0, 0, 0);
        if (cachedUser && (!cachedUser.last_limit_reset || cachedUser.last_limit_reset < today)) {
            userLimitCache.delete(jid);
        } else {
            return cachedUser;
        }
    }

    _statements.upsertUserForLimiting.run(jid);
    let user = _statements.getUserForLimiting.get(jid);

    const today = new Date().setHours(0, 0, 0, 0);
    if (user && (!user.last_limit_reset || user.last_limit_reset < today)) {
        _statements.resetUserLimit.run(today, jid);
        user = _statements.getUserForLimiting.get(jid);
    }
    
    if (user) {
        userLimitCache.set(jid, user);
    }
    return user;
}

export const setPremium = db.transaction((jid, expiresAt) => {
    _statements.setPremium.run(jid, expiresAt);
    userLimitCache.delete(jid);
});

export const removePremium = db.transaction((jid) => {
    _statements.removePremium.run(jid);
    userLimitCache.delete(jid);
});

export const updateGroupSettings = db.transaction((params) => {
    _statements.upsertGroupSettings.run(params);
    groupSettingsCache.delete(params.groupId);
});

export const setAfkUser = db.transaction((jid, reason, afkSince) => {
    _statements.insertAfkUser.run(jid, reason, afkSince);
    afkUserCache.delete(jid);
});

export const removeAfkUser = db.transaction((jid) => {
    _statements.deleteAfkMentions.run(jid);
    _statements.deleteAfkUser.run(jid);
    afkUserCache.delete(jid);
});

export default db;