/*
* Lokasi: src/lib/utils.js
* Versi: v9
*/
import db, { groupMembershipCache } from '#database';
import { groupMetadataCache as connectionGroupMetadataCache } from '#connection';
import config from '#config';
import logger from './logger.js';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

export const getNumber = (jid) => (jid || '').split('@')[0].split(':')[0];

export function getBotJid(sock) {
    const botJid = sock.user?.id;
    if (!botJid) return null;
    return jidNormalizedUser(botJid);
}

export function getSenderJid(m) {
    return jidNormalizedUser(m.key.participant || m.sender || m.key.remoteJid);
}

export async function getParticipantInfo(sock, groupId, targetJid) {
    if (!groupId || !targetJid) return null;
    try {
        let metadata = connectionGroupMetadataCache.get(groupId);
        if (!metadata) {
            metadata = await sock.groupMetadata(groupId);
            if (metadata) connectionGroupMetadataCache.set(groupId, metadata);
        }

        if (!metadata || !metadata.participants) return null;

        const targetNum = getNumber(targetJid);
        if (!targetNum) return null;

        return metadata.participants.find(p => getNumber(p.id) === targetNum) || null;

    } catch (error) {
        logger.error({ err: error, group: groupId, target: targetJid }, 'Gagal mengambil informasi partisipan.');
        return null;
    }
}

export async function checkSpecialGroupMembership(sock, userJid) {
    if (!config.specialLimitGroup) return false;
    
    if (groupMembershipCache.has(userJid)) {
        return groupMembershipCache.get(userJid);
    }

    try {
        const participant = await getParticipantInfo(sock, config.specialLimitGroup, userJid);
        const isMember = !!participant;
        groupMembershipCache.set(userJid, isMember);
        return isMember;
    } catch (error) {
        logger.warn({ err: error, group: config.specialLimitGroup, user: userJid }, "Gagal memeriksa keanggotaan grup spesial.");
        groupMembershipCache.set(userJid, false);
        return false;
    }
}

export function getPositionsWithDisplayId(user_jid) {
    return db.prepare("SELECT * FROM rpg_trading_positions WHERE user_jid = ? AND status = 'open' ORDER BY opened_at ASC").all(user_jid);
}

export const formatCoin = (number) => `${Math.floor(number).toLocaleString('id-ID')} 🪙`;