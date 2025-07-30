/*
* Lokasi: database/queries/aiQueries.js
* Versi: v1
*/

export default (db) => ({
    getAiHistory: db.prepare('SELECT history FROM ai_history WHERE userId = ?'),
    updateAiHistory: db.prepare('INSERT INTO ai_history (userId, history) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET history = excluded.history;'),
    deleteAiHistory: db.prepare('DELETE FROM ai_history WHERE userId = ?')
});