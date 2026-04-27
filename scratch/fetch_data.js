const fetch = require('node-fetch'); // wait, Next.js environment might have global fetch

async function run() {
  try {
    const res = await fetch('https://gmass-pro.vercel.app/api/emails', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      console.log("Status:", res.status);
      const text = await res.text();
      console.log("Body:", text.substring(0, 200));
      return;
    }
    const json = await res.json();
    console.log("ACCOUNTS:", json.accounts.length);
    if (json.accounts.length > 0) {
      const account = json.accounts[0];
      console.log(`ACCOUNT: ${account.email}`);
      console.log(`TOTAL EMAILS: ${account.emails.length}`);
      account.emails.slice(0, 20).forEach(e => {
        console.log(`- ${e.date} | ${e.sender} | ${e.subject} | ${e.folder}`);
      });
    }
  } catch (e) {
    console.error(e);
  }
}

run();
