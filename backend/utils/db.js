import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, '../data');
const DB_PATH    = join(DATA_DIR, 'users.json');

function readDB() {
  if (!existsSync(DB_PATH)) return { users: [] };
  return JSON.parse(readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function findUserByEmail(email) {
  const { users } = readDB();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export function findUserById(id) {
  const { users } = readDB();
  return users.find(u => u.id === id) || null;
}

export function createUser(userData) {
  const db = readDB();
  db.users.push(userData);
  writeDB(db);
  return userData;
}

export function updateUser(id, updates) {
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  db.users[idx] = { ...db.users[idx], ...updates };
  writeDB(db);
  return db.users[idx];
}

export function getAllSubscribed() {
  const { users } = readDB();
  return users.filter(u => u.emailNotifications && u.watchlist?.length > 0);
}

export function getAllUsers() {
  return readDB().users;
}

export function deleteUser(id) {
  const db = readDB();
  const before = db.users.length;
  db.users = db.users.filter(u => u.id !== id);
  writeDB(db);
  return db.users.length < before;
}
