/*
* Lokasi: database/queries/groupQueries.js
* Versi: v2
*/
export default (db) => ({
    getGroupSettings: db.prepare('SELECT antilink_enabled, welcome_enabled, welcome_message FROM groups WHERE groupId = ?'),
    upsertGroupSettings: db.prepare(`
        INSERT INTO groups (groupId, antilink_enabled, welcome_enabled, welcome_message) 
        VALUES (@groupId, @antilink, @welcome_en, @welcome_msg) 
        ON CONFLICT(groupId) DO UPDATE SET 
            antilink_enabled = COALESCE(excluded.antilink_enabled, antilink_enabled), 
            welcome_enabled = COALESCE(excluded.welcome_enabled, welcome_enabled), 
            welcome_message = COALESCE(excluded.welcome_message, welcome_message)`
    ),
    incrementMessageCount: db.prepare('INSERT INTO group_user_stats (group_id, user_jid) VALUES (?, ?) ON CONFLICT(group_id, user_jid) DO UPDATE SET message_count = message_count + 1'),
    getTopChatters: db.prepare('SELECT user_jid, message_count FROM group_user_stats WHERE group_id = ? ORDER BY message_count DESC LIMIT 10'),
    setGroupListItem: db.prepare('INSERT INTO group_lists (group_id, list_key, list_value) VALUES (@groupId, @key, @value) ON CONFLICT(group_id, list_key) DO UPDATE SET list_value = excluded.list_value'),
    getGroupListItem: db.prepare('SELECT list_value FROM group_lists WHERE group_id = ? AND list_key = ?'),
    deleteGroupListItem: db.prepare('DELETE FROM group_lists WHERE group_id = ? AND list_key = ?'),
    getAllGroupListItems: db.prepare('SELECT list_key FROM group_lists WHERE group_id = ? ORDER BY list_key ASC'),
    upsertUserActivity: db.prepare('INSERT INTO group_user_activity (group_id, user_jid, last_message_timestamp) VALUES (?, ?, ?) ON CONFLICT(group_id, user_jid) DO UPDATE SET last_message_timestamp = excluded.last_message_timestamp'),
    getActiveUsersSince: db.prepare('SELECT user_jid FROM group_user_activity WHERE group_id = ? AND last_message_timestamp > ?')
});