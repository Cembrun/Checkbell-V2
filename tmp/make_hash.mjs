import bcrypt from 'bcrypt';

async function run() {
  const pw = process.argv[2] || 'admin1234';
  const hash = await bcrypt.hash(pw, 10);
  console.log(hash);
}

run().catch((e) => { console.error(e); process.exit(1); });
