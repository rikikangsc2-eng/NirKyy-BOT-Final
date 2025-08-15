/*
 * Lokasi: src/events/groupUpdate.js
 * Versi: v2
 */

import config from '#config';
import { getGroupSettings, groupMembershipCache } from '#database';
import { groupMetadataCache as connectionGroupMetadataCache } from '#connection';
import logger from '#lib/logger.js';

export async function handleGroupParticipantsUpdate(sock, event) {
    const { id, participants, action } = event;

    if (id === config.specialLimitGroup) {
        participants.forEach(p => groupMembershipCache.delete(p));
    }

    if (action !== 'add' || participants.length === 0) return;

    try {
        const groupSettings = getGroupSettings(id) || {};
        if (!groupSettings?.welcome_enabled) return;

        let metadata = connectionGroupMetadataCache.get(id);
        if (!metadata) {
            metadata = await sock.groupMetadata(id);
            connectionGroupMetadataCache.set(id, metadata);
        }

        if (!metadata) return;

        const mentions = participants.map(jid => `@${jid.split('@')[0]}`).join(' ');
        const welcomeMessage = (groupSettings.welcome_message || '')
            .replace(/@user/g, mentions)
            .replace(/@subject/g, metadata.subject);

        await sock.sendMessage(id, { text: welcomeMessage, mentions: participants });
    } catch (error) {
        logger.error({ err: error, group: id }, `Error di event welcome.`);
    }
}