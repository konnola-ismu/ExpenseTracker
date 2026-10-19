const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '../package.json');
const appJsonPath = path.join(__dirname, '../app.json');

const firebaseUrl = 'https://myappsversions-default-rtdb.firebaseio.com/AppVersionManage/expense_tracker.json';

async function main() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

    const currentVersion = packageJson.version || "1.0.0";
    const parts = currentVersion.split('.');

    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentDay = now.getDate(); // 1-31

    // If running inside EAS Build cloud environment, check if this version is already updated on Firebase
    if (process.env.EAS_BUILD === 'true') {
      try {
        const checkRes = await fetch(firebaseUrl);
        const checkData = await checkRes.json();
        const appData = checkData?.expense_tracker || checkData;
        if (appData && appData.version === currentVersion && appData.appName === "Expense Tracker") {
          console.log(`[EAS Build] Version ${currentVersion} already synced to Firebase. Skipping redundant bump.`);
          return;
        }
      } catch (checkErr) {
        console.warn('[EAS Build] Could not verify existing Firebase version, proceeding with bump:', checkErr.message);
      }
    }

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
    const vParts = newVersion.split('.').map(n => parseInt(n, 10) || 0);
    const versionCode = (vParts[0] || 1) * 1000000 + (vParts[1] || 0) * 10000 + (vParts[2] || 0) * 100 + (vParts[3] || 1);

    packageJson.version = newVersion;
    if (appJson.expo) {
      appJson.expo.version = newVersion;
      if (!appJson.expo.android) {
        appJson.expo.android = {};
      }
      appJson.expo.android.versionCode = versionCode;
    }

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

    // Also sync android/app/build.gradle fallback values if the file exists
    const buildGradlePath = path.join(__dirname, '../android/app/build.gradle');
    if (fs.existsSync(buildGradlePath)) {
      let gradleContent = fs.readFileSync(buildGradlePath, 'utf8');
      gradleContent = gradleContent.replace(
        /appVersionName\s*=\s*packageJson\?\.version\s*\?:\s*["'].*?["']/,
        `appVersionName = packageJson?.version ?: "${newVersion}"`
      );
      fs.writeFileSync(buildGradlePath, gradleContent, 'utf8');
    }

    console.log(`Version bumped to ${newVersion} (versionCode: ${versionCode})`);


    // Push the new version to Firebase Realtime Database
    const firebaseData = {
      appName: "Expense Tracker",
      version: newVersion,
      latestChanges: [
        "New release updates and bug fixes"
      ]
    };

    console.log(`Syncing version ${newVersion} to Firebase (${firebaseUrl})...`);
    const updateRes = await fetch(firebaseUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(firebaseData)
    });

    if (!updateRes.ok) {
      throw new Error(`Firebase update failed with status ${updateRes.status}`);
    }

    const responseData = await updateRes.json();
    console.log(`Successfully pushed version ${newVersion} to Firebase!`, responseData);
  } catch (err) {
    console.error('Error updating version and Firebase:', err);
    process.exit(1);
  }
}

main();

