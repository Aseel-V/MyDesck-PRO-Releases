## Network Sign-In Notes

This app uses Supabase for authentication. It does not use Firebase for sign-in.

### Public environment variables required

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These values are read at build time by Vite, so after changing them you must rebuild or restart the dev server.

### LAN / other-device testing

Run the app so it listens on all interfaces:

```bash
npm run dev
```

or for a built app:

```bash
npm run build
npm run preview
```

The scripts now bind to `0.0.0.0`, so you can open the app from another PC with:

```text
http://YOUR_SERVER_IP:5173
```

or preview mode:

```text
http://YOUR_SERVER_IP:4173
```

### Supabase redirect/domain setup

Password sign-in does not require a special authorized-domain entry in code.

If you use password reset links, magic links, or add OAuth later, make sure the server URL or IP you open in the browser is added in Supabase Dashboard:

- `Authentication -> URL Configuration -> Site URL / Redirect URLs`

Examples:

- `http://192.168.1.20:5173/#/reset-password`
- `http://192.168.1.20:4173/#/reset-password`

If you later add Google or other OAuth providers, those same browser-visible URLs must also be allowed in the provider configuration.
