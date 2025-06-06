import {GoogleAuth} from 'google-auth-library';

async function getGoogleIdToken(url: string) {
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(url);
  const id_token = await client.idTokenProvider.fetchIdToken(url);
  return `Bearer ${id_token}`;
}

export {getGoogleIdToken};
