/*
 * Lokasi: src/processors/groupProcessor.js
 * Versi: v4
 */

import { getGroupSettings } from '#database';
import { getParticipantInfo } from '#lib/utils.js';

const whatsappGroupInviteRegex = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i;

export async function handleGroupFeatures(sock, m, text) {
    const groupId = m.key.remoteJid;
    const groupSettings = getGroupSettings(groupId) || {};
    if (groupSettings?.antilink_enabled) {
        
        const senderInfo = await getParticipantInfo(sock, groupId, m.sender);
        if (senderInfo?.admin) {
            return true; 
        }
        
        const botJid = sock.user.id.split('@')[0] + '@s.whatsapp.net';
        const botInfo = await getParticipantInfo(sock, groupId, botJid);
        
        if (botInfo?.admin && whatsappGroupInviteRegex.test(text)) {
            await sock.sendMessage(groupId, { text: `🚨 Terdeteksi link grup WhatsApp!\n@${m.sender.split('@')[0]} dilarang mengirim link undangan di grup ini.`, mentions: [m.sender] });
            await sock.sendMessage(groupId, { delete: m.key });
            return false;
        }
    }
    return true;
}