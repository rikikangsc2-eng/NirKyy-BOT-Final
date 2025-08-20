/*
* Lokasi: src/processors/afkProcessor.js
* Versi: v1
*/

import { LRUCache } from 'lru-cache';
import { getAfkUser, removeAfkUser, statements } from '#database';

const afkNotificationCooldown = new LRUCache({ max: 1000, ttl: 1000 * 60 });

function formatDuration(ms) {
    if (ms < 0) ms = -ms;
    const time = { hari: Math.floor(ms / 86400000), jam: Math.floor(ms / 3600000) % 24, menit: Math.floor(ms / 60000) % 60, detik: Math.floor(ms / 1000) % 60 };
    return Object.entries(time).filter(val => val[1] !== 0).map(([key, val]) => `${val} ${key}`).join(', ') || 'beberapa saat';
}

async function handleSenderAfk(sock, m, senderAfkData) {
    const afkDuration = formatDuration(Date.now() - senderAfkData.afk_since);
    const userMention = `@${m.sender.split('@')[0]}`;
    const mentionsData = statements.getAfkMentions.all(m.sender);
    const mentionJids = new Set([m.sender]);
    let summaryMessage = `*${userMention} telah kembali aktif* setelah AFK selama *${afkDuration}*.`;
    if (mentionsData.length > 0) {
        summaryMessage += `\n\nSelama kamu pergi, ada *${mentionsData.length} pesan* buat kamu:\n`;
        mentionsData.forEach(mention => {
            const mentionerTag = `@${mention.mentioner_jid.split('@')[0]}`;
            const shortText = (mention.message_text || '').slice(0, 50) + ((mention.message_text || '').length > 50 ? '...' : '');
            summaryMessage += `\n- Dari ${mentionerTag}:\n  > _"${shortText}"_`;
            mentionJids.add(mention.mentioner_jid);
        });
    }
    await sock.sendMessage(m.key.remoteJid, { text: summaryMessage, mentions: Array.from(mentionJids) });
    removeAfkUser(m.sender);
}

async function handleMentionedAfk(sock, m, text) {
    const contextInfo = m.message?.extendedTextMessage?.contextInfo;
    const directMentions = contextInfo?.mentionedJid || [];
    const replyMention = contextInfo?.participant ? [contextInfo.participant] : [];
    const jidsToCheck = new Set([...directMentions, ...replyMention]);

    if (jidsToCheck.size === 0 || !m.key.remoteJid.endsWith('@g.us')) return;

    for (const jid of jidsToCheck) {
        const afkData = getAfkUser(jid);
        if (!afkData || afkData.jid === m.sender) continue;
        
        const cooldownKey = `${m.sender}:${afkData.jid}`;
        if (afkNotificationCooldown.has(cooldownKey)) continue;

        const afkDuration = formatDuration(Date.now() - afkData.afk_since);
        const afkMessage = `Heh, jangan ganggu @${afkData.jid.split('@')[0]}, dia lagi AFK.\n\n*Alasan:* ${afkData.reason}\n*Sejak:* ${afkDuration} yang lalu.`;
        await sock.sendMessage(m.key.remoteJid, { text: afkMessage, mentions: [afkData.jid] }, { quoted: m });
        
        afkNotificationCooldown.set(cooldownKey, true);
        statements.insertAfkMention.run(afkData.jid, m.sender, m.pushName || 'Seseorang', m.key.remoteJid, text, Date.now());
    }
}

export async function handleAfkLogic(sock, m, text) {
    const senderAfkData = getAfkUser(m.sender);
    if (senderAfkData) {
        await handleSenderAfk(sock, m, senderAfkData);
    }
    await handleMentionedAfk(sock, m, text);
}