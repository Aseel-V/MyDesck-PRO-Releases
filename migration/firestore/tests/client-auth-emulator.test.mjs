#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const credentials=JSON.parse(readFileSync('migration/app-layer.local/app-credentials.json','utf8'));
assert.ok(credentials.users.every(u=>u.email.startsWith('migration-test--')));
const app=initializeApp({projectId:'mydesck-migration-proof',apiKey:'emulator-only'},`auth-client-${Date.now()}`);
const auth=getAuth(app); connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
const first=await signInWithEmailAndPassword(auth,credentials.users[0].email,credentials.password);
assert.equal(first.user.uid,credentials.users[0].uid,'UID preserved on login');
const token=await first.user.getIdToken();
const refreshed=await first.user.getIdToken(true);
assert.ok(token.length>100&&refreshed.length>100,'normal and forced-refresh tokens issued');
assert.equal(auth.currentUser?.uid,credentials.users[0].uid,'identity survives token refresh');
await signOut(auth); assert.equal(auth.currentUser,null,'logout clears identity');
const second=await signInWithEmailAndPassword(auth,credentials.users[0].email,credentials.password);
assert.equal(second.user.uid,credentials.users[0].uid,'logout/login preserves identity');
await signOut(auth); await deleteApp(app);
console.log('Firebase client Auth emulator: login, UID, token refresh, logout/login PASS (6 assertions)');
