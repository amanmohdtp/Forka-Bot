import fs from 'fs';
import path from 'path';

const DB_PATH = './database.json';

function loadDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    const initialData = {
      sudoUsers: [],
      botMode: 'public',
      groupSettings: {},
      welcomeMessages: {},
      goodbyeMessages: {},
      autoAddGroup: '120363422739354013@g.us'
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function saveDatabase(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function initializeOwner(ownerNumber) {
  if (!ownerNumber) return;
  const numbers = ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
  console.log(`Initialized owner(s): ${numbers.join(', ')}`);
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
  const index = db.sudoUsers.indexOf(number);
  if (index > -1) {
    db.sudoUsers.splice(index, 1);
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
}

export function getBotMode() {
  const db = loadDatabase();
  return db.botMode || 'public';
}

export function getGroupSettings(groupJid) {
  const db = loadDatabase();
  if (!db.groupSettings[groupJid]) {
    db.groupSettings[groupJid] = {
      welcome: false,
      goodbye: false,
      antilink: false
    };
    saveDatabase(db);
  }
  return db.groupSettings[groupJid];
}

export function setGroupSettings(groupJid, settings) {
  const db = loadDatabase();
  db.groupSettings[groupJid] = settings;
  saveDatabase(db);
}

export function getWelcomeMessage(groupJid) {
  const db = loadDatabase();
  return db.welcomeMessages[groupJid] || 'Welcome {user} to {group}!\n\nMember #{count}';
}

export function setWelcomeMessage(groupJid, message) {
  const db = loadDatabase();
  db.welcomeMessages[groupJid] = message;
  saveDatabase(db);
}

export function getGoodbyeMessage(groupJid) {
  const db = loadDatabase();
  return db.goodbyeMessages[groupJid] || 'Goodbye {user}! We will miss you.';
}

export function setGoodbyeMessage(groupJid, message) {
  const db = loadDatabase();
  db.goodbyeMessages[groupJid] = message;
  saveDatabase(db);
}

export function setAutoAddGroup(groupJid) {
  const db = loadDatabase();
  db.autoAddGroup = groupJid;
  saveDatabase(db);
}

export function getAutoAddGroup() {
  const db = loadDatabase();
  return db.autoAddGroup;
}

export function removeAutoAddGroup() {
  const db = loadDatabase();
  db.autoAddGroup = null;
  saveDatabase(db);
}