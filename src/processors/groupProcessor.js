/*
* Lokasi: src/processors/groupProcessor.js
* Versi: v1
*/

import { getGroupSettings } from '#database';
import { groupMetadataCache } from '#connection';

const whatsappGroupInviteRegex = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i;

export async function handleGroupFeatures(sock, m, text) {
    const groupSettings = getGroupSettings(m.key.remoteJid) || {};
    if (groupSettings?.antilink_enabled) {
        let metadata = groupMetadataCache.get(m.key.remoteJid);
        if (!metadata) {
            metadata = await sock.groupMetadata(m.key.remoteJid);
            groupMetadataCache.set(m.key.remoteJid, metadata);
        }
        
        const senderInfo = metadata.participants.find(p => p.id === m.sender);
        if (senderInfo?.admin) {
            return true; 
        }

        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const botIsAdmin = metadata.participants.find(p => p.id === botId)?.admin;
        
        if (botIsAdmin && whatsappGroupInviteRegex.test(text)) {
            await sock.sendMessage(m.key.remoteJid, { text: `🚨 Terdeteksi link grup WhatsApp!\n@${m.sender.split('@')[0]} dilarang mengirim link undangan di grup ini.`, mentions: [m.sender] });
            await sock.sendMessage(m.key.remoteJid, { delete: m.key });
            return false;
        }
    }
    return true;
}