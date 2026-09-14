# Simple Auth reopen

## How login works
1. Username + password must match [`src/auth/users.js`](../src/auth/users.js)
2. App signs into Firebase Auth (creates the Auth user on first login)
3. Firestore allows access only if `request.auth != null`

## One Console step
Firebase → `vasundhara-4c6e5` → Authentication → Email/Password → **Enable**

Then deploy UI + rules:
```bash
npm run clinical:deploy-rules
```

Staff use the same usernames/passwords as before.
