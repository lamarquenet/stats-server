// utils/jsonStore.js
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read JSON file, return default if not exists
 * @param {string} filename - Filename within data directory
 * @param {any} defaultValue - Default value if file doesn't exist
 */
function readJson(filename, defaultValue = {}) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err.message);
    return defaultValue;
  }
}

/**
 * Write JSON file atomically
 * @param {string} filename - Filename within data directory
 * @param {any} data - Data to write
 */
function writeJson(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filename}:`, err.message);
    return false;
  }
}

module.exports = { readJson, writeJson, DATA_DIR };
