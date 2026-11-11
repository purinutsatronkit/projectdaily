import { socialFromEnvironment } from '../apps/api/src/social-config.ts';

try {
  const config = socialFromEnvironment();
  if (!config.google) {
    console.error('Google sign-in is disabled. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env using credentials for a Google OAuth Web application.');
    process.exitCode = 1;
  } else {
    console.log('Google credentials are configured (values are not displayed). This does not verify that Google accepts them.');
  }
  console.log(`Open TaskFlow at: ${config.publicUrl}`);
  console.log(`Google Console authorized redirect URI: ${config.publicUrl}/api/auth/google/callback`);
  console.log('After changing .env, restart the API. Then /api/auth/providers should report google: true.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid OAuth configuration.');
  process.exitCode = 1;
}
