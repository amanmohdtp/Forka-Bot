import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jidDecode } from '@whiskeysockets/baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database.json');

function jidToNumber(jid) {
  const decoded = jidDecode(jid);
  return decoded?.user || jid.split('@')[0];
}

let db = {
    botMode: 'public',
    sudoUsers: [],
    groupSettings: {},
    welcomeMessages: {},
    goodbyeMessages: {},
    autoAddGroup: '120363422739354013@g.us'
};

function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            db = JSON.parse(data);
            
            if (!Array.isArray(db.sudoUsers)) db.sudoUsers = [];
        }
    } catch (error) {
        console.error('Error loading database:', error.message);
    }
}

function saveDB() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error('Error saving database:', error.message);
    }
}

loadDB();

export function initializeOwner(ownerNumbersString) {
    if (!ownerNumbersString) return;
    
    const ownerNumbers = ownerNumbersString.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
    
    ownerNumbers.forEach(cleanNumber => {
        if (cleanNumber && !db.sudoUsers.includes(cleanNumber)) {
            db.sudoUsers.push(cleanNumber);
            console.log(`Owner ${cleanNumber} added to sudo users`);
        }
    });
    
    saveDB();
}

export function getBotMode() {
    return db.botMode || 'public';
}

export function setBotMode(mode) {
    if (!['public', 'private'].includes(mode)) return false;
    db.botMode = mode;
    saveDB();
    return true;
}

export function isSudoUser(jid) {
    const number = jidToNumber(jid);
    return db.sudoUsers.includes(number);
}

export function addSudoUser(jid) {
    const number = jidToNumber(jid);
    if (db.sudoUsers.includes(number)) return false;
    db.sudoUsers.push(number);
    saveDB();
    return true;
}

export function removeSudoUser(jid) {
    const number = jidToNumber(jid);
    const index = db.sudoUsers.indexOf(number);
    if (index === -1) return false;
    db.sudoUsers.splice(index, 1);
    saveDB();
    return true;
}

export function getAllSudoUsers() {
    return [...db.sudoUsers];
}

export function getGroupSettings(groupJid) {
    if (!db.groupSettings[groupJid]) {
        db.groupSettings[groupJid] = {
            welcome: false,
            goodbye: false,
            antilink: false,
            antilinkMode: 'all'
        };
        saveDB();
    }
    return db.groupSettings[groupJid];
}

export function setGroupSettings(groupJid, settings) {
    db.groupSettings[groupJid] = { ...db.groupSettings[groupJid], ...settings };
    saveDB();
    return true;
}

export function getWelcomeMessage(groupJid) {
    return db.welcomeMessages[groupJid] || 
           'Hey {user}! Welcome to {group} ⭐\n\nYou are our {count}th member!';
}

export function setWelcomeMessage(groupJid, message) {
    db.welcomeMessages[groupJid] = message;
    saveDB();
    return true;
}

export function getGoodbyeMessage(groupJid) {
    return db.goodbyeMessages[groupJid] || 
           'Goodbye {user}! 👋\n\nThanks for being part of {group}';
}

export function setGoodbyeMessage(groupJid, message) {
    db.goodbyeMessages[groupJid] = message;
    saveDB();
    return true;
}

export function getAutoAddGroup() {
    return db.autoAddGroup;
}

export function setAutoAddGroup(groupJid) {
    db.autoAddGroup = groupJid;
    saveDB();
    return true;
}