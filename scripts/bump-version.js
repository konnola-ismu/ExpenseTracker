const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '../package.json');
const appJsonPath = path.join(__dirname, '../app.json');

const packageJson = require(packageJsonPath);
const appJson = require(appJsonPath);

const currentVersion = packageJson.version || "1.0.0";
const parts = currentVersion.split('.');

const now = new Date();
const currentMonth = now.getMonth() + 1; // 1-12
const currentDay = now.getDate(); // 1-31

let yearPart = parseInt(parts[0], 10) || 1;
let monthPart = parts.length > 1 ? parseInt(parts[1], 10) : 0;
let dayPart = parts.length > 2 ? parseInt(parts[2], 10) : 0;
let releasePart = parts.length > 3 ? parseInt(parts[3], 10) : 0;

if (monthPart === currentMonth && dayPart === currentDay) {
    // Same day, increment release
    releasePart += 1;
} else {
    // New day
    monthPart = currentMonth;
    dayPart = currentDay;
    releasePart = 1;
}

const newVersion = `${yearPart}.${monthPart}.${dayPart}.${releasePart}`;

packageJson.version = newVersion;
if (appJson.expo) {
    appJson.expo.version = newVersion;
}

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

console.log(`Version bumped to ${newVersion}`);

// Push the new version to Firebase Realtime Database
const firebaseUrl = 'https://myappsversions-default-rtdb.firebaseio.com/AppVersionManage.json';

const firebaseData = {
  appName: "Expense Tracker",
  version: newVersion,
  latestChanges: [
    "New release updates and bug fixes" // You can modify this string manually before each release if you want specific points
  ]
};

fetch(firebaseUrl)
  .then(response => response.json())
  .then(existingData => {
    if (!existingData) {
      console.log("Table 'AppVersionManage' does not exist on Firebase. Creating it for the first time...");
    } else {
      console.log("Table 'AppVersionManage' found on Firebase. Updating version...");
    }

    // Now push the updated version data
    return fetch(firebaseUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(firebaseData)
    });
  })
  .then(response => response.json())
  .then(data => {
    console.log(`Successfully pushed version ${newVersion} to Firebase!`);
  })
  .catch(error => {
    console.error('Error pushing version to Firebase:', error);
  });
