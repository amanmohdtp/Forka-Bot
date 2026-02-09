import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { jidDecode } from '@whiskeysockets/baileys';

const ADMIN_CACHE_PATH = './database/group_admins.json';
const ADMIN_CACHE_TTL = 30 * 60 * 1000;

function jidToNumber(jid) {
  if (!jid) return null;
  
  try {
    if (typeof jid === 'string' && /^\d+$/.test(jid)) {
      return jid;
    }
    
    const jidString = String(jid);
    
    if (jidString.includes('@lid')) {
      const numberPart = jidString.split('@')[0];
      if (numberPart && /^\d+$/.test(numberPart)) {
        return numberPart;
      }
    }
    
    if (jidString.includes('@s.whatsapp.net')) {
      const userPart = jidString.split('@')[0];
      const numberPart = userPart.split(':')[0];
      if (numberPart && /^\d+$/.test(numberPart)) {
        return numberPart;
      }
    }
    
    if (jidString.includes('@g.us')) {
      return jidString;
    }
    
    try {
      const decoded = jidDecode(jidString);
      if (decoded?.user) {
        return decoded.user;
      }
    } catch (e) {}
    
    const numbers = jidString.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      return numbers.join('');
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

function ensureAdminCacheDir() {
  const dir = path.dirname(ADMIN_CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadAdminCache() {
  try {
    ensureAdminCacheDir();
    if (fs.existsSync(ADMIN_CACHE_PATH)) {
      const data = JSON.parse(fs.readFileSync(ADMIN_CACHE_PATH, 'utf8'));
      return data || {};
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
    
    if (!cache[chatId]) {
      cache[chatId] = {};
    }

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
    
    if (!cache[chatId]) {
      cache[chatId] = { admins: {}, timestamp: Date.now() };
    }
    
    cache[chatId].admins[userId] = true;
    cache[chatId].timestamp = Date.now();
    
    saveAdminCache(cache);
    console.log(chalk.green(`✅ Admin ${userId} added to cache for ${chatId}`));
  } catch (e) {
    console.error(chalk.red('❌ Error adding admin to cache:'), e.message);
  }
}

export function removeAdminFromCache(chatId, userId) {
  try {
    const cache = loadAdminCache();
    
    if (cache[chatId] && cache[chatId].admins) {
      delete cache[chatId].admins[userId];
      cache[chatId].timestamp = Date.now();
      saveAdminCache(cache);
      console.log(chalk.green(`✅ Admin ${userId} removed from cache for ${chatId}`));
    }
  } catch (e) {
    console.error(chalk.red('❌ Error removing admin from cache:'), e.message);
  }
}

export function isUserAdminInCache(chatId, userId) {
  try {
    const cache = loadAdminCache();
    const groupCache = cache[chatId];
    
    if (!groupCache || !isAdminCacheValid(groupCache.timestamp)) {
      return false;
    }
    
    return groupCache.admins && groupCache.admins[userId] === true;
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
    console.log(chalk.blue(`\n[ADMIN-CACHE] === getGroupDataForPlugin START ===`));
    console.log(chalk.cyan(`[ADMIN-CACHE] Chat ID: ${chatId}`));
    console.log(chalk.cyan(`[ADMIN-CACHE] Sender ID: ${senderId}`));
    console.log(chalk.cyan(`[ADMIN-CACHE] Bot User ID: ${sock.user?.id}`));
    
    if (!global.groupCache) {
      global.groupCache = new Map();
    }
    
    const cached = global.groupCache.get(chatId);
    if (cached && (Date.now() - cached.timestamp) < 5000) {
      console.log(chalk.yellow(`[ADMIN-CACHE] ✓ Using cached data (${Date.now() - cached.timestamp}ms old)`));
      console.log(chalk.yellow(`[ADMIN-CACHE] Cached isBotAdmin: ${cached.data.isBotAdmin}`));
      console.log(chalk.blue(`[ADMIN-CACHE] === getGroupDataForPlugin END (CACHED) ===\n`));
      return cached.data;
    }

    console.log(chalk.blue(`[ADMIN-CACHE] Fetching fresh group metadata...`));
    const metadata = await sock.groupMetadata(chatId).catch(err => {
      console.log(chalk.red(`[ADMIN-CACHE] ❌ Error fetching metadata: ${err.message}`));
      return null;
    });
    
    if (!metadata) {
      console.log(chalk.red(`[ADMIN-CACHE] ❌ No metadata available`));
      console.log(chalk.blue(`[ADMIN-CACHE] === getGroupDataForPlugin END (NO METADATA) ===\n`));
      return {
        groupMetadata: {},
        participants: [],
        isAdmin: false,
        isBotAdmin: false
      };
    }

    console.log(chalk.cyan(`[ADMIN-CACHE] Total participants: ${metadata.participants?.length}`));

    const participants = (metadata.participants || []).map(p => ({
      id: p.id || p.jid,
      lid: p.lid,
      admin: p.admin
    }));

    await updateGroupAdmins(chatId, participants);

    let realUserJid = senderId;
    if (senderId && senderId.includes('@lid')) {
      const participantData = participants.find(p => p.lid === senderId);
      if (participantData && participantData.id) {
        realUserJid = participantData.id;
      }
    }

    const senderNumber = jidToNumber(realUserJid);
    const botNumber = jidToNumber(sock.user.id);

    console.log(chalk.cyan(`[ADMIN-CACHE] Bot number extracted: ${botNumber}`));
    console.log(chalk.cyan(`[ADMIN-CACHE] Sender number extracted: ${senderNumber}`));

    const userGroup = participants.find(p => {
      const pNumber = jidToNumber(p.id);
      return pNumber === senderNumber;
    }) || {};

    let botGroup = {};
    let foundBot = false;
    
    for (const p of participants) {
      const pNumber = jidToNumber(p.id);
      const pLid = p.lid;
      const pLidNumber = pLid ? jidToNumber(pLid) : null;
      
      if (pNumber === botNumber || pLidNumber === botNumber) {
        console.log(chalk.green(`[ADMIN-CACHE] ✅ BOT FOUND!`));
        console.log(chalk.green(`   - JID: ${p.id}`));
        console.log(chalk.green(`   - LID: ${p.lid}`));
        console.log(chalk.green(`   - Admin Status: ${p.admin}`));
        botGroup = p;
        foundBot = true;
        break;
      }
    }

    if (!foundBot) {
      console.log(chalk.yellow(`[ADMIN-CACHE] ⚠️ Bot participant NOT found in group!`));
      console.log(chalk.yellow(`[ADMIN-CACHE] Participants in group:`));
      participants.forEach((p, i) => {
        console.log(chalk.yellow(`   ${i + 1}. ${jidToNumber(p.id)} (admin: ${p.admin})`));
      });
    }

    const isBotAdmin = botGroup?.admin === 'admin' || botGroup?.admin === 'superadmin';
    console.log(chalk.cyan(`[ADMIN-CACHE] Final isBotAdmin result: ${isBotAdmin}`));

    const groupData = {
      groupMetadata: metadata,
      participants,
      isAdmin: userGroup?.admin === 'admin' || userGroup?.admin === 'superadmin',
      isBotAdmin: isBotAdmin
    };

    global.groupCache.set(chatId, {
      data: groupData,
      timestamp: Date.now()
    });

    console.log(chalk.green(`[ADMIN-CACHE] Data cached successfully`));
    console.log(chalk.blue(`[ADMIN-CACHE] === getGroupDataForPlugin END ===\n`));

    return groupData;
  } catch (e) {
    console.error(chalk.red(`\n[ADMIN-CACHE] ❌ ERROR in getGroupDataForPlugin:`));
    console.error(chalk.red(`Message: ${e.message}`));
    console.error(chalk.red(`Stack: ${e.stack}\n`));
    
    return {
      groupMetadata: {},
      participants: [],
      isAdmin: false,
      isBotAdmin: false
    };
  }
}

export function clearGroupCache(chatId) {
  try {
    if (global.groupCache) {
      global.groupCache.delete(chatId);
      console.log(chalk.cyan(`🗑️ Cleared group cache for ${chatId}`));
    }
  } catch (e) {
    console.error(chalk.red('❌ Error clearing group cache:'), e.message);
  }
}

export function getAllCachedGroups() {
  try {
    const cache = loadAdminCache();
    return Object.keys(cache);
  } catch (e) {
    console.error(chalk.red('❌ Error getting cached groups:'), e.message);
    return [];
  }
}

export function getCacheStats() {
  try {
    const cache = loadAdminCache();
    const stats = {
      totalGroups: Object.keys(cache).length,
      groups: {}
    };

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
      console.log(chalk.yellow(`⚠️ Invalidated cache for ${chatId}`));
    }
  } catch (e) {
    console.error(chalk.red('❌ Error invalidating cache:'), e.message);
  }
}