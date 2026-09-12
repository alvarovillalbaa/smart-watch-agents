import { createSign } from 'node:crypto';

function base64url(value) { return Buffer.from(value).toString('base64url'); }

function apnsJwt() {
  const { APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY } = process.env;
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) return null;
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }));
  const claims = base64url(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const signer = createSign('SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${signer.sign({ key: APNS_PRIVATE_KEY.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

export async function sendPush(device, notification) {
  const title = device.privacy_mode === 'summary' ? notification.title : 'Agent update';
  const body = device.privacy_mode === 'summary' ? notification.body : notification.redactedBody;
  if (device.platform === 'watchos') {
    const jwt = apnsJwt();
    if (!jwt || !process.env.APNS_BUNDLE_ID) throw new Error('APNs is not configured');
    const response = await fetch(`https://api.push.apple.com/3/device/${device.push_token}`, {
      method: 'POST',
      headers: { authorization: `bearer ${jwt}`, 'apns-topic': process.env.APNS_BUNDLE_ID, 'apns-push-type': 'alert' },
      body: JSON.stringify({ aps: { alert: { title, body }, sound: 'default' }, watchAgents: notification.data })
    });
    if (!response.ok) throw new Error(`APNs ${response.status}: ${await response.text()}`);
    return;
  }
  const account = process.env.FCM_SERVICE_ACCOUNT_JSON ? JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON) : null;
  if (!account?.client_email || !account.private_key || !account.project_id) throw new Error('FCM is not configured');
  const now = Math.floor(Date.now() / 1000); const tokenEndpoint = account.token_uri || 'https://oauth2.googleapis.com/token';
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenEndpoint, iat: now, exp: now + 3600 }));
  const signer = createSign('SHA256'); signer.update(`${header}.${claims}`); signer.end();
  const assertion = `${header}.${claims}.${signer.sign(account.private_key).toString('base64url')}`;
  const tokenResponse = await fetch(tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!tokenResponse.ok) throw new Error(`FCM OAuth ${tokenResponse.status}: ${await tokenResponse.text()}`);
  const oauth = await tokenResponse.json();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${oauth.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: { token: device.push_token, notification: { title, body }, data: notification.data } })
  });
  if (!response.ok) throw new Error(`FCM ${response.status}: ${await response.text()}`);
}
