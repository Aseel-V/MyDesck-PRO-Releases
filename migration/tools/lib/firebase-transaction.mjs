const PROJECT = 'mydesckpro';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Backend-only boundary. There is intentionally no separate UID parameter. */
export async function withFirebaseTransaction(auth, pool, token, work) {
  let uid = null;
  if (token !== null) {
    if (typeof token !== 'string' || !token) throw new Error('INVALID_TOKEN');
    // Admin SDK validates signature, issuer, audience and expiry; check revocation too.
    const claims = await auth.verifyIdToken(token, true);
    if (!UUID.test(claims.uid) || claims.sub !== claims.uid ||
        claims.aud !== PROJECT || claims.iss !== `https://securetoken.google.com/${PROJECT}` ||
        !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('INVALID_VERIFIED_IDENTITY');
    }
    uid = claims.uid;
  }
  // A rejected token cannot even acquire a database connection.
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    await client.query('SELECT auth.bind_identity($1::uuid, $2)', [uid, uid ? 'authenticated' : 'anon']);
    await client.query(uid ? 'SET LOCAL ROLE authenticated' : 'SET LOCAL ROLE anon');
    const result = await work(client, uid);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
