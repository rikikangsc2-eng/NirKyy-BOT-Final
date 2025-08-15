/*
 * Lokasi: src/processors/limitProcessor.js
 * Versi: v4
 */

import { statements, userLimitCache, removePremium } from '#database';
import { checkSpecialGroupMembership } from '#lib/utils.js';

export async function getAndManageUserLimit(sock, userJid) {
    statements.upsertUserForLimiting.run(userJid);
    let user = statements.getUserForLimiting.get(userJid);

    if (user.is_premium && user.premium_expires_at <= Date.now()) {
        removePremium(userJid);
        user = statements.getUserForLimiting.get(userJid);
    }
    
    if (!user.is_premium) {
        const isMember = await checkSpecialGroupMembership(sock, userJid);
        if (isMember) {
            const d = new Date();
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const startOfWeek = new Date(new Date().setDate(diff)).setHours(0, 0, 0, 0);

            if (!user.last_weekly_reset || user.last_weekly_reset < startOfWeek) {
                statements.resetUserWeeklyLimit.run(startOfWeek, userJid);
                user = statements.getUserForLimiting.get(userJid);
            }
        } else {
            const today = new Date().setHours(0, 0, 0, 0);
            if (!user.last_limit_reset || user.last_limit_reset < today) {
                statements.resetUserLimit.run(today, userJid);
                user = statements.getUserForLimiting.get(userJid);
            }
        }
    }
    
    if (user) userLimitCache.set(userJid, user);
    return user;
}


export async function checkLimit(sock, userJid) {
    const user = await getAndManageUserLimit(sock, userJid);
    if (!user) return { canUse: true };

    if (user.is_premium) {
        return { canUse: true };
    }

    const isMember = await checkSpecialGroupMembership(sock, userJid);
    const maxLimit = isMember ? 700 : 5;
    return { canUse: user.limit_usage < maxLimit };
}

export function consumeLimit(userJid) {
    statements.updateUserLimit.run(userJid);
    userLimitCache.delete(userJid);
}