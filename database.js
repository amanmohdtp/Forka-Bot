import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database.json');
const DB_DIR = path.dirname(DB_PATH);

function ensureDatabaseDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function loadDatabase() {
  try {
    ensureDatabaseDir();
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
  } catch (e) {
    console.error(chalk.red(`❌ Error loading database: ${e.message}`));
    return { sudoUsers: [], botMode: 'public', groupSettings: {}, welcomeMessages: {}, goodbyeMessages: {}, autoAddGroup: null };
  }
}

function saveDatabase(data) {
  try {
    ensureDatabaseDir();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(chalk.red(`❌ Error saving database: ${e.message}`));
  }
}

export function initializeOwner(ownerNumber) {
  if (!ownerNumber) {
    console.log(chalk.yellow('⚠️  No owner number provided'));
    return;
  }
  const numbers = ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
  console.log(chalk.green(`✅ Owner(s) initialized: ${numbers.join(', ')}`));
}

export function addSudoUser(number) {
  try {
    const db = loadDatabase();
    if (!db.sudoUsers.includes(number)) {
      db.sudoUsers.push(number);
      saveDatabase(db);
      console.log(chalk.green(`✅ Sudo user added: +${number}`));
      return true;
    }
    return false;
  } catch (e) {
    console.error(chalk.red(`❌ Error adding sudo user: ${e.message}`));
    return false;
  }
}

export function removeSudoUser(number) {
  try {
    const db = loadDatabase();
    const index = db.sudoUsers.indexOf(number);
    if (index > -1) {
      db.sudoUsers.splice(index, 1);
      saveDatabase(db);
      console.log(chalk.green(`✅ Sudo user removed: +${number}`));
      return true;
    }
    return false;
  } catch (e) {
    console.error(chalk.red(`❌ Error removing sudo user: ${e.message}`));
    return false;
  }
}

export function isSudoUser(number) {
  try {
    const db = loadDatabase();
    return db.sudoUsers.includes(number);
  } catch (e) {
    console.error(chalk.red(`❌ Error checking sudo user: ${e.message}`));
    return false;
  }
}

export function getAllSudoUsers() {
  try {
    const db = loadDatabase();
    return db.sudoUsers || [];
  } catch (e) {
    console.error(chalk.red(`❌ Error getting sudo users: ${e.message}`));
    return [];
  }
}

export function setBotMode(mode) {
  try {
    if (!['public', 'private'].includes(mode)) return false;
    const db = loadDatabase();
    db.botMode = mode;
    saveDatabase(db);
    console.log(chalk.green(`✅ Bot mode changed to: ${mode}`));
    return true;
  } catch (e) {
    console.error(chalk.red(`❌ Error setting bot mode: ${e.message}`));
    return false;
  }
}

export function getBotMode() {
  try {
    const db = loadDatabase();
    return db.botMode || 'public';
  } catch (e) {
    console.error(chalk.red(`❌ Error getting bot mode: ${e.message}`));
    return 'public';
  }
}

export function getGroupSettings(groupJid) {
  try {
    const db = loadDatabase();
    if (!db.groupSettings[groupJid]) {
      db.groupSettings[groupJid] = { welcome: false, goodbye: false, antilink: false, created: new Date().toISOString() };
      saveDatabase(db);
    }
    return db.groupSettings[groupJid];
  } catch (e) {
    console.error(chalk.red(`❌ Error getting group settings: ${e.message}`));
    return { welcome: false, goodbye: false, antilink: false };
  }
}

export function setGroupSettings(groupJid, settings) {
  try {
    const db = loadDatabase();
    db.groupSettings[groupJid] = { ...db.groupSettings[groupJid], ...settings, updated: new Date().toISOString() };
    saveDatabase(db);
    return true;
  } catch (e) {
    console.error(chalk.red(`❌ Error setting group settings: ${e.message}`));
    return false;
  }
}

export function getWelcomeMessage(groupJid) {
  try {
    const db = loadDatabase();
    return db.welcomeMessages[groupJid] || 'Welcome {user} to {group}!\n\nMember #{count} 👋';
  } catch (e) {
    console.error(chalk.red(`❌ Error getting welcome message: ${e.message}`));
    return 'Welcome {user} to {group}!';
  }
}

export function setWelcomeMessage(groupJid, message) {
  try {
    if (!message?.trim()) return false;
    const db = loadDatabase();
    db.welcomeMessages[groupJid] = message;
    saveDatabase(db);
    return true;
  } catch (e) {
    console.error(chalk.red(`❌ Error setting welcome message: ${e.message}`));
    return false;
  }
}

export function getGoodbyeMessage(groupJid) {
  try {
    const db = loadDatabase();
    return db.goodbyeMessages[groupJid] || 'Goodbye {user}! We will miss you 👋';
  } catch (e) {
    console.error(chalk.red(`❌ Error getting goodbye message: ${e.message}`));
    return 'Goodbye {user}!';
  }
}

export function setGoodbyeMessage(groupJid, message) {
  try {
    if (!message?.trim()) return false;
    const db = loadDatabase();
    db.goodbyeMessages[groupJid] = message;
    saveDatabase(db);
    return true;
  } catch (e) {
    console.error(chalk.red(`❌ Error setting goodbye message: ${e.message}`));
    return false;
  }
}

export function setAutoAddGroup(groupJid) {
  try {
    const db = loadDatabase();
    db.autoAddGroup = groupJid;
    saveDatabase(db);
    console.log(chalk.green(`✅ Auto add group set to: ${groupJid}`));
    return true;
  } catch (e) {
    console.error(chalk.red(`❌ Error setting auto add group: ${e.message}`));
    return false;
  }
}

export function getAutoAddGroup() {
  try {
    const db = loadDatabase();
    return db.autoAddGroup || null;
  } catch (e) {
    console.error(chalk.red(`❌ Error getting auto add group: ${e.message}`));
    return null;
  }
}

export function removeAutoAddGroup() {
  try {
    const db = loadDatabase();
    db.autoAddGroup = null;
    saveDatabase(db);
    console.log(chalk.green(`✅ Auto add group removed`));
    return true;
  } catch (e) {
    console.error(chalk.red(`❌ Error removing auto add group: ${e.message}`));
    return false;
  }
}

export function getDatabaseStats() {
  try {
    const db = loadDatabase();
    return { sudoUsers: db.sudoUsers.length, groups: Object.keys(db.groupSettings).length, botMode: db.botMode };
  } catch (e) {
    console.error(chalk.red(`❌ Error getting database stats: ${e.message}`));
    return {};
  }
}

export function clearDatabase() {
  try {
    const initialData = { sudoUsers: [], botMode: 'public', groupSettings: {}, welcomeMessages: {}, goodbyeMessages: {}, autoAddGroup: null };
    saveDatabase(initialData);
    console.log(chalk.green(`✅ Database cleared`));
    return true;
  } catch (e) {
    console.error(chalk.red(`❌ Error clearing database: ${e.message}`));
    return false;
  }
}

export function backupDatabase() {
  try {
    ensureDatabaseDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(DB_DIR, `database.backup.${timestamp}.json`);
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    fs.writeFileSync(backupPath, data);
    console.log(chalk.green(`✅ Database backed up to ${backupPath}`));
    return true;
  } catch (e) {
    console.error(chalk.red(`❌ Error backing up database: ${e.message}`));
    return false;
  }
}