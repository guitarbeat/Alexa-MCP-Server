import fs from 'node:fs';
import path from 'node:path';
import alexaCookie from 'alexa-cookie2';

const envPath = path.join(process.cwd(), '.env');

function updateEnv(ubidMain: string, atMain: string) {
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  const lines = envContent.split('\n');
  let ubidFound = false;
  let atFound = false;

  const newLines = lines.map((line) => {
    if (line.startsWith('UBID_MAIN=')) {
      ubidFound = true;
      return `UBID_MAIN="${ubidMain}"`;
    }
    if (line.startsWith('AT_MAIN=')) {
      atFound = true;
      return `AT_MAIN="${atMain}"`;
    }
    return line;
  });

  if (!ubidFound) {
    newLines.push(`UBID_MAIN="${ubidMain}"`);
  }
  if (!atFound) {
    newLines.push(`AT_MAIN="${atMain}"`);
  }

  fs.writeFileSync(envPath, newLines.join('\n'), 'utf-8');
}

async function main() {
  console.log('\nStarting Alexa Cookie Collection Service...');
  console.log('------------------------------------------');
  console.log('1. This will start a temporary proxy server on your machine.');
  console.log('2. Open the URL below in your browser.');
  console.log('3. Log in to your Amazon account.');
  console.log('4. Once finished, this script will automatically capture the cookies.\n');

  const options = {
    amazonPage: 'amazon.com',
    proxyOnly: true,
    proxyOwnIp: 'localhost',
    proxyPort: 3456,
    setupProxy: true,
    baseAmazonPage: 'amazon.com',
    acceptLanguage: 'en-US',
    amazonPageProxyLanguage: 'en_US',
  };

  alexaCookie.generateAlexaCookie('', '', options, (err: unknown, result: unknown) => {
    if (err) {
      const error = err as { message?: string };
      if (error.message && error.message.includes('Please open http')) {
        // This is just the instruction to the user, not a real error
        return;
      }
      console.error('\nError generating cookie:', err);
      process.exit(1);
    }

    const res = result as { localCookie?: string };
    if (res && res.localCookie) {
      console.log('\n✅ Success! Cookie collected.');

      // Extract ubid-main and at-main from the cookie string
      const cookies = res.localCookie
        .split(';')
        .reduce((acc: Record<string, string>, curr: string) => {
          const [key, value] = curr.trim().split('=');
          if (key && value) {
            acc[key] = value;
          }
          return acc;
        }, {});

      const ubidMain = cookies['ubid-main'];
      const atMain = cookies['at-main'];

      if (ubidMain && atMain) {
        updateEnv(ubidMain, atMain);
        console.log('✅ Updated .env file with new credentials.');
        console.log(`\nUBID_MAIN: ${ubidMain.substring(0, 5)}...`);
        console.log(`AT_MAIN: ${atMain.substring(0, 10)}...`);
      } else {
        console.error('\n❌ Could not find ubid-main or at-main in the collected cookie.');
        console.log('Raw result keys:', Object.keys(res));
        console.log('Cookie keys found:', Object.keys(cookies));
      }

      alexaCookie.stopProxyServer();
      process.exit(0);
    }
  });

  console.log(`👉 Please open http://localhost:3456 in your browser to log in.`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
