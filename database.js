import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database.json');

// Initialize database
let db = {
    botMode: 'public',
    sudoUsers: [],
    groupSettings: {},
    welcomeMessages: {},
    goodbyeMessages: {},
    autoAddGroup: null 
};

// Load database
function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            db = JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading database:', error.message);
    }
}

// Save database
function saveDB() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error('Error saving database:', error.message);
    }
}

// Initialize on import
loadDB();

// Bot Mode Functions
export function getBotMode() {
    return db.botMode || 'public';
}

export function setBotMode(mode) {
    if (!['public', 'private'].includes(mode)) return false;
    db.botMode = mode;
    saveDB();
    return true;
}

// Sudo User Functions
export function isSudoUser(jid) {
    const number = jid.split('@')[0];
    return db.sudoUsers.includes(number);
}

export function addSudoUser(jid) {
    const number = jid.split('@')[0];
    if (db.sudoUsers.includes(number)) return false;
    db.sudoUsers.push(number);
    saveDB();
    return true;
}

export function removeSudoUser(jid) {
    const number = jid.split('@')[0];
    const index = db.sudoUsers.indexOf(number);
    if (index === -1) return false;
    db.sudoUsers.splice(index, 1);
    saveDB();
    return true;
}

export function getAllSudoUsers() {
    return [...db.sudoUsers];
}

// Group Settings Functions
export function getGroupSettings(groupJid) {
    if (!db.groupSettings[groupJid]) {
        db.groupSettings[groupJid] = {
            welcome: false,
            goodbye: false,
            antilink: false,
            antilinkMode: 'all' // 'all' or 'users'
        };
        saveDB();
    }
    return db.groupSettings[groupJid];
}

export function setGroupSettings(groupJid, settings) {
    db.groupSettings[groupJid] = settings;
    saveDB();
    return true;
}

// Welcome Message Functions
export function getWelcomeMessage(groupJid) {
    return db.welcomeMessages[groupJid] || 
           'Hey {user}! Welcome to {group} ⭐\n\nYou are our {count}th member!';
}

export function setWelcomeMessage(groupJid, message) {
    db.welcomeMessages[groupJid] = message;
    saveDB();
    return true;
}

// Goodbye Message Functions
export function getGoodbyeMessage(groupJid) {
    return db.goodbyeMessages[groupJid] || 
           'Goodbye {user}! 👋\n\nThanks for being part of {group}';
}

export function setGoodbyeMessage(groupJid, message) {
    db.goodbyeMessages[groupJid] = message;
    saveDB();
    return true;
}

// Auto-Add Group Functions
export function getAutoAddGroup() {
    return db.autoAddGroup;
}

export function setAutoAddGroup(groupJid) {
    db.autoAddGroup = groupJid;
    saveDB();
    return true;
}

export function removeAutoAddGroup() {
    db.autoAddGroup = null;
    saveDB();
    return true;
}
