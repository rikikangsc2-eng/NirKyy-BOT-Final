/*
* Lokasi: database/queries/userQueries.js
* Versi: v2
*/

export default (db) => ({
    getAfkUser: db.prepare('SELECT jid, reason, afk_since FROM afk_users WHERE jid = ?'),
    getAfkMentions: db.prepare('SELECT mentioner_jid, mentioner_name, message_text FROM afk_mentions WHERE afk_user_jid = ? ORDER BY message_timestamp ASC'),
    deleteAfkUser: db.prepare('DELETE FROM afk_users WHERE jid = ?'),
    deleteAfkMentions: db.prepare('DELETE FROM afk_mentions WHERE afk_user_jid = ?'),
    insertAfkUser: db.prepare('INSERT INTO afk_users (jid, reason, afk_since) VALUES (?, ?, ?) ON CONFLICT(jid) DO UPDATE SET reason = excluded.reason, afk_since = excluded.afk_since'),
    insertAfkMention: db.prepare('INSERT INTO afk_mentions (afk_user_jid, mentioner_jid, mentioner_name, chat_jid, message_text, message_timestamp) VALUES (?, ?, ?, ?, ?, ?)'),
    getUserForLimiting: db.prepare('SELECT jid, limit_usage, last_limit_reset, is_premium, premium_expires_at, last_claim, last_weekly_reset FROM users WHERE jid = ?'),
    upsertUserForLimiting: db.prepare('INSERT INTO users (jid) VALUES (?) ON CONFLICT(jid) DO NOTHING'),
    updateUserLimit: db.prepare('UPDATE users SET limit_usage = limit_usage + 1 WHERE jid = ?'),
    resetUserLimit: db.prepare('UPDATE users SET limit_usage = 0, last_limit_reset = ? WHERE jid = ?'),
    resetUserWeeklyLimit: db.prepare('UPDATE users SET limit_usage = 0, last_weekly_reset = ? WHERE jid = ?'),
    performDailyClaim: db.prepare('UPDATE users SET limit_usage = limit_usage - 20, last_claim = ? WHERE jid = ?'),
    setPremium: db.prepare('INSERT INTO users (jid, is_premium, premium_expires_at) VALUES (?, 1, ?) ON CONFLICT(jid) DO UPDATE SET is_premium = 1, premium_expires_at = excluded.premium_expires_at'),
    removePremium: db.prepare('UPDATE users SET is_premium = 0, premium_expires_at = NULL WHERE jid = ?'),
    getUserLastInteraction: db.prepare('SELECT last_interaction FROM users WHERE jid = ?'),
    updateUserInteraction: db.prepare('INSERT INTO users (jid, last_interaction) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET last_interaction = excluded.last_interaction;')
});