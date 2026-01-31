import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'bot_db.json');

const defaultDB = {
  mode: 'public',
  sudoUsers: []
};

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
      return defaultDB;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return defaultDB;
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function getBotMode() {
  return loadDB().mode || 'public';
}

export function setBotMode(mode) {
  const db = loadDB();
  db.mode = mode;
  return saveDB(db);
}

export function isSudoUser(jid) {
  const db = loadDB();
  const number = jid.split('@')[0];
  return db.sudoUsers.includes(number);
}

export function addSudoUser(jid) {
  const db = loadDB();
  const number = jid.split('@')[0];
  
  if (db.sudoUsers.includes(number)) return false;
  
  db.sudoUsers.push(number);
  return saveDB(db);
}

export function removeSudoUser(jid) {
  const db = loadDB();
  const number = jid.split('@')[0];
  
  const index = db.sudoUsers.indexOf(number);
  if (index === -1) return false;
  
  db.sudoUsers.splice(index, 1);
  return saveDB(db);
}

export function getAllSudoUsers() {
  return loadDB().sudoUsers || [];
}
