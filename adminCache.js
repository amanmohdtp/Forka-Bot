import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { jidDecode } from '@whiskeysockets/baileys';

const ADMIN_CACHE_PATH = './database/group_admins.json';
const ADMIN_CACHE_TTL = 30 * 60 * 1000;

function jidToNumber(jid) {
  if (!jid) return null;
  try {
    if (typeof jid === 'string' && /^\d+$/.test(jid)) return jid;
    const jidString = String(jid);
    if (jidString.includes('@lid')) {
      const numberPart = jidString.split('@')[0];
      if (numberPart && /^\d+$/.test(numberPart)) return numberPart;
    }
    if (jidString.includes('@s.whatsapp.net')) {
      const userPart = jidString.split('@')[0];
      const numberPart = userPart.split(':')[0];
      if (numberPart && /^\d+$/.test(numberPart)) return numberPart;
    }
    if (jidString.includes('@g.us')) return jidString;
    try {
      const decoded = jidDecode(jidString);
      if (decoded?.user) return decoded.user;
    } catch {}
    const numbers = jidString.match(/\d+/g);
    if (numbers?.length) return numbers.join('');
    return null;
  } catch {
    return null;
  }
}

function ensureAdminCacheDir() {
  const dir = path.dirname(ADMIN_CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAdminCache() {
  try {
    ensureAdminCacheDir();
    if (fs.existsSync(ADMIN_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(ADMIN_CACHE_PATH, 'utf8')) || {};
    }
  } catch (e) {
    console.error(chalk.red('❌ Error loading admin cache:'), e.message);
  }
  return {};
}

function saveAdminCache(cache) {
  try {
    ensureAdminCacheDir();
    fs.writeFileSync(ADMIN_CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error(chalk.red('❌ Error saving admin cache:'), e.message);
  }
}

function isAdminCacheValid(timestamp) {
  return timestamp && (Date.now() - timestamp) < ADMIN_CACHE_TTL;
}

export async function updateGroupAdmins(chatId, participants) {
  try {
    const cache = loadAdminCache();
    if (!cache[chatId]) cache[chatId] = {};
    const admins = {};
    for (const p of participants) {
      const userId = jidToNumber(p.id || p.jid);
      if (userId && (p.admin === 'admin' || p.admin === 'superadmin')) {
        admins[userId] = true;
      }
    }
    cache[chatId].admins = admins;
    cache[chatId].timestamp = Date.now();
    saveAdminCache(cache);
  } catch (e) {
    console.error(chalk.red('❌ Error updating group admins:'), e.message);
  }
}

export function addAdminToCache(chatId, userId) {
  try {
    const cache = loadAdminCache();
    if (!cache[chatId]) cache[chatId] = { admins: {}, timestamp: Date.now() };
    cache[chatId].admins[userId] = true;
    cache[chatId].timestamp = Date.now();
    saveAdminCache(cache);
  } catch (e) {
    console.error(chalk.red('❌ Error adding admin to cache:'), e.message);
  }
}

export function removeAdminFromCache(chatId, userId) {
  try {
    const cache = loadAdminCache();
    if (cache[chatId]?.admins) {
      delete cache[chatId].admins[userId];
      cache[chatId].timestamp = Date.now();
      saveAdminCache(cache);
    }
  } catch (e) {
    console.error(chalk.red('❌ Error removing admin from cache:'), e.message);
  }
}

export function isUserAdminInCache(chatId, userId) {
  try {
    const cache = loadAdminCache();
    const groupCache = cache[chatId];
    if (!groupCache || !isAdminCacheValid(groupCache.timestamp)) return false;
    return groupCache.admins?.[userId] === true;
  } catch (e) {
    console.error(chalk.red('❌ Error checking admin in cache:'), e.message);
    return false;
  }
}

export function clearGroupAdminCache(chatId) {
  try {
    const cache = loadAdminCache();
    if (cache[chatId]) {
      delete cache[chatId];
      saveAdminCache(cache);
      console.log(chalk.cyan(`🗑️ Cleared admin cache for ${chatId}`));
    }
  } catch (e) {
    console.error(chalk.red('❌ Error clearing group admin cache:'), e.message);
  }
}

export async function getGroupDataForPlugin(sock, chatId, senderId) {
  try {
    if (!global.groupCache) global.groupCache = new Map();
    const cached = global.groupCache.get(chatId);
    if (cached && (Date.now() - cached.timestamp) < 5000) {
      return cached.data;
    }

    const metadata = await sock.groupMetadata(chatId).catch(() => null);
    if (!metadata) {
      return { groupMetadata: {}, participants: [], isAdmin: false, isBotAdmin: false, botParticipantId: null };
    }

    const participants = (metadata.participants || []).map(p => ({
      id: p.id || p.jid,
      admin: p.admin
    }));

    await updateGroupAdmins(chatId, participants);

    const botNumber = jidToNumber(sock.user.id);
    let botParticipant = null;
    for (const p of participants) {
      if (jidToNumber(p.id) === botNumber) {
        botParticipant = p;
        break;
      }
    }

    const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
    const senderNumber = jidToNumber(senderId);
    const userParticipant = participants.find(p => jidToNumber(p.id) === senderNumber) || {};

    const groupData = {
      groupMetadata: metadata,
      participants,
      isAdmin: userParticipant?.admin === 'admin' || userParticipant?.admin === 'superadmin',
      isBotAdmin,
      botParticipantId: botParticipant?.id || null   // ← LID of the bot in this group
    };

    global.groupCache.set(chatId, { data: groupData, timestamp: Date.now() });
    return groupData;
  } catch (e) {
    console.error(chalk.red('[ADMIN-CACHE] ❌ getGroupDataForPlugin error:'), e.message);
    return {
      groupMetadata: {},
      participants: [],
      isAdmin: false,
      isBotAdmin: false,
      botParticipantId: null
    };
  }
}

export function clearGroupCache(chatId) {
  try {
    if (global.groupCache) global.groupCache.delete(chatId);
  } catch (e) {
    console.error(chalk.red('❌ Error clearing group cache:'), e.message);
  }
}

export function getAllCachedGroups() {
  try {
    return Object.keys(loadAdminCache());
  } catch (e) {
    console.error(chalk.red('❌ Error getting cached groups:'), e.message);
    return [];
  }
}

export function getCacheStats() {
  try {
    const cache = loadAdminCache();
    const stats = { totalGroups: Object.keys(cache).length, groups: {} };
    for (const [groupId, data] of Object.entries(cache)) {
      stats.groups[groupId] = {
        admins: Object.keys(data.admins || {}).length,
        timestamp: new Date(data.timestamp).toLocaleString(),
        isValid: isAdminCacheValid(data.timestamp)
      };
    }
    return stats;
  } catch (e) {
    console.error(chalk.red('❌ Error getting cache stats:'), e.message);
    return { totalGroups: 0, groups: {} };
  }
}

export function invalidateGroupCache(chatId) {
  try {
    const cache = loadAdminCache();
    if (cache[chatId]) {
      cache[chatId].timestamp = 0;
      saveAdminCache(cache);
    }
  } catch (e) {
    console.error(chalk.red('❌ Error invalidating cache:'), e.message);
  }
}