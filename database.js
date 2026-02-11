import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database.json');

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initial = {
        sudoUsers: [],
        botMode: 'public',
        groupSettings: {},
        welcomeMessages: {},
        goodbyeMessages: {},
        autoAddGroup: '120363422739354013@g.us',
        botLid: null
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {
    console.error(chalk.red('DB load error:'), e.message);
    return { sudoUsers: [], botMode: 'public', groupSettings: {}, welcomeMessages: {}, goodbyeMessages: {}, autoAddGroup: null, botLid: null };
  }
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(chalk.red('DB save error:'), e.message);
  }
}

export function initializeOwner(ownerNumber) {
  if (!ownerNumber) return;
  const nums = ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
  console.log(chalk.green(`✅ Owner(s): ${nums.join(', ')}`));
}

export function addSudoUser(number) {
  const db = loadDatabase();
  if (!db.sudoUsers.includes(number)) {
    db.sudoUsers.push(number);
    saveDatabase(db);
    return true;
  }
  return false;
}

export function removeSudoUser(number) {
  const db = loadDatabase();
  const idx = db.sudoUsers.indexOf(number);
  if (idx > -1) {
    db.sudoUsers.splice(idx, 1);
    saveDatabase(db);
    return true;
  }
  return false;
}

export function isSudoUser(number) {
  const db = loadDatabase();
  return db.sudoUsers.includes(number);
}

export function getAllSudoUsers() {
  const db = loadDatabase();
  return db.sudoUsers || [];
}

export function setBotMode(mode) {
  const db = loadDatabase();
  db.botMode = mode;
  saveDatabase(db);
  return true;
}

export function getBotMode() {
  const db = loadDatabase();
  return db.botMode || 'public';
}

export function getGroupSettings(groupJid) {
  const db = loadDatabase();
  if (!db.groupSettings[groupJid]) {
    db.groupSettings[groupJid] = { welcome: false, goodbye: false, antilink: false };
    saveDatabase(db);
  }
  return db.groupSettings[groupJid];
}

export function setGroupSettings(groupJid, settings) {
  const db = loadDatabase();
  db.groupSettings[groupJid] = { ...db.groupSettings[groupJid], ...settings };
  saveDatabase(db);
  return true;
}

export function getWelcomeMessage(groupJid) {
  const db = loadDatabase();
  return db.welcomeMessages[groupJid] || 'Welcome {user} to {group}!';
}

export function setWelcomeMessage(groupJid, message) {
  const db = loadDatabase();
  db.welcomeMessages[groupJid] = message;
  saveDatabase(db);
  return true;
}

export function getGoodbyeMessage(groupJid) {
  const db = loadDatabase();
  return db.goodbyeMessages[groupJid] || 'Goodbye {user}!';
}

export function setGoodbyeMessage(groupJid, message) {
  const db = loadDatabase();
  db.goodbyeMessages[groupJid] = message;
  saveDatabase(db);
  return true;
}

export function setAutoAddGroup(groupJid) {
  const db = loadDatabase();
  db.autoAddGroup = groupJid;
  saveDatabase(db);
  return true;
}

export function getAutoAddGroup() {
  const db = loadDatabase();
  return db.autoAddGroup || null;
}

export function removeAutoAddGroup() {
  const db = loadDatabase();
  db.autoAddGroup = null;
  saveDatabase(db);
  return true;
}

// ---------- BOT LID ----------
export function setBotLid(lid) {
  const db = loadDatabase();
  db.botLid = lid;
  saveDatabase(db);
  return true;
}

export function getBotLid() {
  const db = loadDatabase();
  return db.botLid || null;
}