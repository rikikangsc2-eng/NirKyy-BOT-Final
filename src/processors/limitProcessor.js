/*
* Lokasi: src/processors/limitProcessor.js
* Versi: v1
*/

import { LRUCache } from 'lru-cache';
import { statements, getUserForLimiting, removePremium } from '#database';
import logger from '#lib/logger.js';
import config from '#config';

const groupMembershipCache = new LRUCache({ max: 500, ttl: 1000 * 60 * 15 });

async function checkUserGroupMembership(sock, userJid) {
    if (!config.specialLimitGroup) return false;
    if (groupMembershipCache.has(userJid)) {
        return groupMembershipCache.get(userJid);
    }
    try {
        const metadata = await sock.groupMetadata(config.specialLimitGroup);
        const isMember = metadata.participants.some(p => p.id === userJid);
        groupMembershipCache.set(userJid, isMember);
        return isMember;
    } catch (error) {
        logger.warn({ err: error, group: config.specialLimitGroup }, "Gagal memeriksa keanggotaan grup spesial.");
        groupMembershipCache.set(userJid, false);
        return false;
    }
}

export async function checkLimit(sock, userJid) {
    const isMember = await checkUserGroupMembership(sock, userJid);
    const user = getUserForLimiting(userJid);
    if (!user) return { canUse: true };

    if (user.is_premium && user.premium_expires_at > Date.now()) {
        return { canUse: true };
    }
    
    if (user.is_premium && user.premium_expires_at <= Date.now()) {
        removePremium(userJid);
        const freshUser = getUserForLimiting(userJid);
        return checkLimit(sock, freshUser.jid); 
    }

    const maxLimit = isMember ? 20 : 5;
    return { canUse: user.limit_usage < maxLimit };
}

export function consumeLimit(userJid) {
    statements.updateUserLimit.run(userJid);
}