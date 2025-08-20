/*
* Lokasi: database/queries/gameQueries.js
* Versi: v1
*/

export default (db) => ({
    getGameSession: db.prepare('SELECT * FROM game_sessions WHERE chat_id = ?'),
    insertOrReplaceGameSession: db.prepare('INSERT OR REPLACE INTO game_sessions (chat_id, game_type, session_data, expires_at) VALUES (?, ?, ?, ?)'),
    deleteGameSession: db.prepare('DELETE FROM game_sessions WHERE chat_id = ?'),
    getExpiredGameSessions: db.prepare('SELECT * FROM game_sessions WHERE expires_at < ?')
});