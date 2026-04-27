const https = require('https');

https.get('https://gmass-pro.vercel.app/api/emails', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log("ACCOUNTS:", json.accounts.length);
      if (json.accounts.length > 0) {
        const account = json.accounts[0];
        console.log(`ACCOUNT: ${account.email}`);
        console.log(`TOTAL EMAILS: ${account.emails.length}`);
        account.emails.slice(0, 10).forEach(e => {
          console.log(`- ${e.date} | ${e.sender} | ${e.subject} | ${e.folder}`);
        });
      }
    } catch (e) {
      console.log("Error parsing JSON:", e.message);
      console.log("Raw response:", data.substring(0, 200));
    }
  });
}).on('error', (e) => {
  console.error("HTTP GET error:", e);
});
