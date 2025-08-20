/*
* Lokasi: src/events/messageUpsert.js
* Versi: v10
*/
import { LRUCache } from 'lru-cache';
import { exec as _exec } from 'child_process';
import { promisify, inspect } from 'util';
import { downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
import { loadCommands } from '#lib/commandLoader.js';
import config from '#config';
import db, { statements } from '#database';
import logger from '#lib/logger.js';
import { handleAiInteraction } from '#lib/aiHelper.js';
import { handleAfkLogic } from '#processors/afkProcessor.js';
import { handleGroupFeatures } from '#processors/groupProcessor.js';
import { checkLimit, consumeLimit } from '#processors/limitProcessor.js';
import { handleGameResponse } from '#game/gameManager.js';
import axios from 'axios';
import { getSenderJid } from '#lib/utils.js';

const exec = promisify(_exec);
let commandsMap;
const processedMessageCache = new LRUCache({ max: 500, ttl: 1000 });

const FourteenDaysInMs = 14 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_PROCESS = 5;
const EXEC_TIMEOUT = 30000;
const LIMIT_REQUIRED_CATEGORIES = ['downloader', 'tools', 'ai', 'random'];

async function handlePrivateMessage(sock, m, text) {
    const user = statements.getUserLastInteraction.get(m.sender);
    if (!user || (Date.now() - user.last_interaction > FourteenDaysInMs)) {
        const ownerJid = config.ownerNumber[0];
        const ownerName = config.ownerName;
        const greetingMessage = `Halo, ${m.pushName || 'Bro'}! 👋\n\nKenalin, aku *Alicia*, asisten AI di *${config.botName}*.\nAku bisa bantu kamu banyak hal, lho! Mulai dari download video, bikin stiker, sampe ngobrol seru.\n\nKalo mau tau aku bisa apa aja, ketik aja \`${config.prefix}menu\`.\nAtau kalo mau ngobrol langsung sama aku, tinggal chat aja di sini, ga usah pake perintah apa-apa!\n\nKalo ada bug atau saran, laporin aja ke ownerku ya:\n*Nama:* \`${ownerName}\`\n*WA:* \`wa.me/${ownerJid.split('@')[0]}\`\n\nYuk, mulai ngobrol! 💅`;
        await sock.sendMessage(m.key.remoteJid, { text: greetingMessage.trim() });
    }
    statements.updateUserInteraction.run(m.sender, Date.now());

    let messageForAi = m;
    let textForAi = text;
    const isQuotedInPrivate = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (isQuotedInPrivate && !m.message.imageMessage) {
        const { quotedMessage, stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
        if (quotedMessage.imageMessage) {
            messageForAi = {
                key: { remoteJid: m.key.remoteJid, id: stanzaId, fromMe: participant === sock.user.id.split(':')[0] + '@s.whatsapp.net', participant },
                message: quotedMessage
            };
            if (!textForAi) textForAi = quotedMessage.imageMessage.caption || '';
        }
    }
    if (!textForAi) textForAi = m.message?.imageMessage?.caption || '';

    const hasImageForAi = messageForAi.message?.imageMessage;
    const shouldTriggerAi = (textForAi && !textForAi.startsWith(config.prefix)) || hasImageForAi;

    if (shouldTriggerAi) {
        let imageBuffer = null;
        if (hasImageForAi) {
            try {
                imageBuffer = await downloadMediaMessage(messageForAi, 'buffer', {});
            } catch (error) {
                logger.error({ err: error, user: m.sender }, 'Gagal unduh gambar di direct message');
                await sock.sendMessage(m.key.remoteJid, { text: 'Gagal download gambar, coba lagi deh.' }, { quoted: m });
                return;
            }
        }
        await handleAiInteraction({ sock, m, text: textForAi, imageBuffer });
    }
}

async function handleCommand(sock, m, text) {
    const fullTextAfterPrefix = text.slice(config.prefix.length).trim();
    const commandArgs = fullTextAfterPrefix.split(/ +/);
    const commandName = commandArgs.shift().toLowerCase();
    const command = commandsMap.get(commandName) || Array.from(commandsMap.values()).find(cmd => cmd.aliases?.includes(commandName));

    if (command) {
        const requiresLimit = LIMIT_REQUIRED_CATEGORIES.includes(command.category) && !config.ownerNumber.includes(m.sender);
        if (requiresLimit) {
            const limitStatus = await checkLimit(sock, m.sender);
            if (!limitStatus.canUse) {
                const ownerContact = config.ownerNumber[0].split('@')[0];
                const limitMessage = ` Waduh, limit harianmu udah abis, bro! 😩\n\nTenang, ada beberapa cara buat nambah limit:\n\n1.  *Gabung Grup Spesial*\nDapetin *20 limit/hari* dengan gabung grup kami:\n${config.groupInviteLink}\n\n2.  *Jadi Pengguna Premium*\nNikmati *limit tak terbatas* cuma dengan *${config.premiumPrice}*! Hubungi owner di wa.me/${ownerContact} untuk upgrade.\n\nLimit bakal di-reset besok. Sabar ya!`;
                await sock.sendMessage(m.key.remoteJid, { text: limitMessage }, { quoted: m });
                return;
            }
        }
        try {
            await command.execute({ sock, m, args: commandArgs, text, commands: commandsMap, commandName });
            if (requiresLimit) consumeLimit(m.sender);
        } catch (error) {
            logger.error({ err: error, command: command.name, user: m.sender }, `Error saat eksekusi command.`);
            await sock.sendMessage(m.key.remoteJid, { text: `Waduh, ada error internal pas jalanin command \`${command.name}\`. Laporan sudah dikirim ke tim teknis.` }, { quoted: m });
        }
        await sock.sendPresenceUpdate('paused', m.key.remoteJid);
        return true;
    }
    return false;
}

async function handleGroupList(sock, m, text) {
    const fullKey = text.slice(config.prefix.length).trim().toLowerCase();
    const listItem = statements.getGroupListItem.get(m.key.remoteJid, fullKey);
    if (listItem) {
        const mediaMatch = listItem.list_value.match(/\[URL\](.*?)\[TYPE\](.*?)\[CAPTION\](.*)/s);
        if (mediaMatch) {
            const [_, url, type, caption] = mediaMatch;
            try {
                const { data: buffer } = await axios.get(url, { responseType: 'arraybuffer' });
                const messagePayload = { caption: caption || '' };
                switch (type) {
                    case 'imageMessage': messagePayload.image = buffer; break;
                    case 'videoMessage': messagePayload.video = buffer; break;
                    case 'stickerMessage': await sock.sendMessage(m.key.remoteJid, { sticker: buffer }, { quoted: m }); return;
                    case 'audioMessage': await sock.sendMessage(m.key.remoteJid, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: m }); return;
                    default: await sock.sendMessage(m.key.remoteJid, { text: listItem.list_value }, { quoted: m }); return;
                }
                await sock.sendMessage(m.key.remoteJid, messagePayload, { quoted: m });
            } catch (error) {
                logger.error({ err: error, url }, "Gagal mengirim media dari list.");
                await sock.sendMessage(m.key.remoteJid, { text: `Gagal mengambil media untuk list *${fullKey}*. Mungkin filenya sudah dihapus.` }, { quoted: m });
            }
        } else {
            await sock.sendMessage(m.key.remoteJid, { text: listItem.list_value }, { quoted: m });
        }
        return true;
    }
    return false;
}

async function handleOwnerCommands(sock, m, text) {
    if (text.startsWith('$ ')) {
        const { stdout, stderr } = await exec(text.slice(2), { timeout: EXEC_TIMEOUT });
        let output = stdout ? `*STDOUT:*\n${stdout}` : '';
        if (stderr) output += `\n*STDERR:*\n${stderr}`;
        await sock.sendMessage(m.key.remoteJid, { text: output.trim() || 'Perintah dieksekusi tanpa output.' }, { quoted: m });
        return true;
    }
    if (text.startsWith('> ') || text.startsWith('=> ')) {
        const code = text.slice(text.startsWith('> ') ? 2 : 3);
        const result = text.startsWith('> ') ? await (Object.getPrototypeOf(async function(){}).constructor)('sock', 'm', 'text', 'db')(sock, m, text, db) : eval(code);
        if (result !== undefined) await sock.sendMessage(m.key.remoteJid, { text: inspect(result, { depth: null }) }, { quoted: m });
        return true;
    }
    return false;
}

export async function handleMessageUpsert(sock) {
    if (!commandsMap) commandsMap = await loadCommands();
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages.filter(msg => !msg.key.fromMe).slice(0, MAX_MESSAGE_PROCESS)) {
            (async () => {
                const messageId = m.key.id;
                if (processedMessageCache.has(messageId)) {
                    return;
                }
                processedMessageCache.set(messageId, true);

                const msgContent = m.message;
                if (!msgContent || msgContent.protocolMessage || msgContent.senderKeyDistributionMessage || msgContent.viewOnceMessage || m.key.remoteJid === 'status@broadcast') {
                    return;
                }
                
                m.sender = getSenderJid(m);
                if (!m.sender) {
                    logger.warn({ msgKey: m.key }, "Tidak dapat menentukan pengirim pesan.");
                    return;
                }
                
                const isGroup = m.key.remoteJid.endsWith('@g.us');

                try {
                    const text = msgContent.conversation || msgContent.extendedTextMessage?.text || msgContent.imageMessage?.caption || msgContent.videoMessage?.caption || '';
                    
                    await handleAfkLogic(sock, m, text);
                    
                    if (config.autoRead) await sock.readMessages([m.key]);

                    const isGameResponse = await handleGameResponse(sock, m, text);
                    if (isGameResponse) return;

                    if (isGroup) {
                        statements.incrementMessageCount.run(m.key.remoteJid, m.sender);
                        statements.upsertUserActivity.run(m.key.remoteJid, m.sender, Date.now());
                        const continueProcessing = await handleGroupFeatures(sock, m, text);
                        if (!continueProcessing) return;
                    }

                    if (config.ownerNumber.includes(m.sender)) {
                        const isOwnerCmd = await handleOwnerCommands(sock, m, text);
                        if (isOwnerCmd) return;
                    }

                    if (text.startsWith(config.prefix)) {
                        const isCmd = await handleCommand(sock, m, text);
                        if (isCmd) return;

                        if (isGroup) {
                            const isListCmd = await handleGroupList(sock, m, text);
                            if (isListCmd) return;
                        }
                    }

                    if (!isGroup) {
                        await handlePrivateMessage(sock, m, text);
                    }

                } catch (error) {
                    logger.error({ err: error, from: m.sender, text }, `Error di handler utama`);
                    await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, ada error nih pas jalanin perintah.' }, { quoted: m });
                }
            })().catch(err => logger.error({ err, msg: m.key }, "Gagal proses pesan individual."));
        }
    });
}