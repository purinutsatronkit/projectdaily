import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  const example = readFileSync('.env.example', 'utf8');
  writeFileSync('.env', example.replace('JWT_SECRET=', `JWT_SECRET=${randomBytes(48).toString('base64url')}`));
  console.log('Created .env with a random JWT signing secret. Next: npm run db:seed');
} else {
  console.log('.env already exists; preserved its contents.');
}
