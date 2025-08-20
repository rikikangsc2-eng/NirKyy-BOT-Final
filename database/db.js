/*
* Lokasi: database/db.js
* Versi: v8
*/
import Database from 'better-sqlite3';
import { LRUCache } from 'lru-cache';
import config from '#config';
import logger from '#lib/logger.js';
import gameQueries from './queries/gameQueries.js';
import groupQueries from './queries/groupQueries.js';
import rpgQueries from './queries/rpgQueries.js';
import userQueries from './queries/userQueries.js';

const db = new Database(config.databaseName);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = 1');
db.pragma('busy_timeout = 5000');
db.exec(`
    CREATE TABLE IF NOT EXISTS groups ( groupId TEXT PRIMARY KEY, welcome_enabled BOOLEAN DEFAULT 0, welcome_message TEXT DEFAULT 'Selamat datang @user di grup @subject!', antilink_enabled BOOLEAN DEFAULT 0 );
    CREATE TABLE IF NOT EXISTS users ( jid TEXT PRIMARY KEY, last_interaction INTEGER, limit_usage INTEGER DEFAULT 0, last_limit_reset INTEGER, is_premium BOOLEAN DEFAULT 0, premium_expires_at INTEGER, last_claim INTEGER DEFAULT 0, last_weekly_reset INTEGER );
    CREATE TABLE IF NOT EXISTS afk_users ( jid TEXT PRIMARY KEY, reason TEXT, afk_since INTEGER NOT NULL );
    CREATE TABLE IF NOT EXISTS afk_mentions ( id INTEGER PRIMARY KEY AUTOINCREMENT, afk_user_jid TEXT NOT NULL, mentioner_jid TEXT NOT NULL, mentioner_name TEXT, chat_jid TEXT NOT NULL, message_text TEXT, message_timestamp INTEGER NOT NULL );
    CREATE TABLE IF NOT EXISTS rpg_users ( jid TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT, age INTEGER, money INTEGER DEFAULT 0, bank_balance INTEGER DEFAULT 0, last_hunt INTEGER DEFAULT 0, last_rob INTEGER DEFAULT 0, last_work INTEGER DEFAULT 0, last_fish INTEGER DEFAULT 0, last_racik INTEGER DEFAULT 0, energy INTEGER DEFAULT 100, max_energy INTEGER DEFAULT 100, last_beg INTEGER DEFAULT 0 );
    CREATE TABLE IF NOT EXISTS rpg_inventory ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT NOT NULL, item_name TEXT NOT NULL, quantity INTEGER NOT NULL, FOREIGN KEY (user_jid) REFERENCES rpg_users (jid) ON DELETE CASCADE, UNIQUE(user_jid, item_name) );
    CREATE TABLE IF NOT EXISTS asset_price_history ( id INTEGER PRIMARY KEY AUTOINCREMENT, asset_name TEXT NOT NULL, timestamp INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL );
    CREATE TABLE IF NOT EXISTS rpg_trading_positions ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT NOT NULL, asset_name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('buy', 'sell')), entry_price REAL NOT NULL, amount_invested INTEGER NOT NULL, stop_loss REAL, take_profit REAL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')), opened_at INTEGER NOT NULL, closed_at INTEGER, pnl INTEGER, FOREIGN KEY (user_jid) REFERENCES rpg_users (jid) ON DELETE CASCADE );
    CREATE TABLE IF NOT EXISTS group_user_stats ( group_id TEXT NOT NULL, user_jid TEXT NOT NULL, message_count INTEGER DEFAULT 1, PRIMARY KEY (group_id, user_jid) );
    CREATE TABLE IF NOT EXISTS group_lists ( group_id TEXT NOT NULL, list_key TEXT NOT NULL, list_value TEXT NOT NULL, PRIMARY KEY (group_id, list_key) );
    CREATE TABLE IF NOT EXISTS game_sessions ( chat_id TEXT PRIMARY KEY, game_type TEXT NOT NULL, session_data TEXT NOT NULL, expires_at INTEGER NOT NULL );
    CREATE TABLE IF NOT EXISTS group_user_activity ( group_id TEXT NOT NULL, user_jid TEXT NOT NULL, last_message_timestamp INTEGER NOT NULL, PRIMARY KEY (group_id, user_jid) );
`);

try {
    const userColumns = db.prepare("PRAGMA table_info(users)").all();
    if (!userColumns.some(col => col.name === 'last_claim')) {
        db.exec("ALTER TABLE users ADD COLUMN last_claim INTEGER DEFAULT 0");
    }
    if (!userColumns.some(col => col.name === 'last_weekly_reset')) {
        db.exec("ALTER TABLE users ADD COLUMN last_weekly_reset INTEGER");
    }
    const rpgColumns = db.prepare("PRAGMA table_info(rpg_users)").all();
    if (!rpgColumns.some(col => col.name === 'last_fish')) db.exec("ALTER TABLE rpg_users ADD COLUMN last_fish INTEGER DEFAULT 0");
    if (!rpgColumns.some(col => col.name === 'last_racik')) db.exec("ALTER TABLE rpg_users ADD COLUMN last_racik INTEGER DEFAULT 0");
    if (!rpgColumns.some(col => col.name === 'max_energy')) db.exec("ALTER TABLE rpg_users ADD COLUMN max_energy INTEGER DEFAULT 100");
    if (!rpgColumns.some(col => col.name === 'last_beg')) db.exec("ALTER TABLE rpg_users ADD COLUMN last_beg INTEGER DEFAULT 0");
    db.prepare("PRAGMA table_info(game_sessions)").all();
} catch (error) {
    if (error.message.includes('no such table: game_sessions')) {
        db.exec("CREATE TABLE IF NOT EXISTS game_sessions ( chat_id TEXT PRIMARY KEY, game_type TEXT NOT NULL, session_data TEXT NOT NULL, expires_at INTEGER NOT NULL );");
        logger.info("Tabel 'game_sessions' berhasil dibuat.");
    } else {
        logger.error({err: error},'Gagal menjalankan migrasi database:');
    }
}

logger.info('Koneksi dan skema database siap.');

export const groupSettingsCache   = new LRUCache({ max: 500, ttl: 1000 * 60 * 30 });
export const rpgUserCache         = new LRUCache({ max: 300, ttl: 1000 * 60 * 5 });
export const userLimitCache       = new LRUCache({ max: 500, ttl: 1000 * 60 * 2 });
export const afkUserCache         = new LRUCache({ max: 300, ttl: 1000 * 60 * 2 });
export const gameSessionCache     = new LRUCache({ max: 100, ttl: 1000 * 60 * 15 });
export const susunkataDataCache   = new LRUCache({ max: 1, ttl: 1000 * 60 * 60 });
export const tebakkataDataCache   = new LRUCache({ max: 1, ttl: 1000 * 60 * 60 });
export const groupMembershipCache = new LRUCache({ max: 500, ttl: 1000 * 60 * 15 });

const _statements = {
    ...gameQueries(db),
    ...groupQueries(db),
    ...rpgQueries(db),
    ...userQueries(db),
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

export async function getSession(chatId) {
    let session = gameSessionCache.get(chatId);
    if (!session) {
        const dbSession = statements.getGameSession.get(chatId);
        if (dbSession) {
            session = JSON.parse(dbSession.session_data);
            session.game_type = dbSession.game_type;
            session.db_expires_at = dbSession.expires_at;
            gameSessionCache.set(chatId, session);
        }
    }
    return session;
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