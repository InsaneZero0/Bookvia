# Auth-Gated App Testing Playbook for Bookvia

## Emergent Google Auth Flow
1. User clicks "Continuar con Google" -> redirected to `https://auth.emergentagent.com/?redirect=...`
2. After Google login, user lands at `/auth/google/callback#session_id=...`
3. Frontend captures session_id, sends POST to `/api/auth/google/session`
4. Backend validates with Emergent Auth, creates/updates user, returns JWT
5. Frontend stores JWT and user data, navigates to `/dashboard`

## Test the Backend Endpoint
```bash
# This should return 401 for invalid session
curl -X POST "https://marketplace-test-21.preview.emergentagent.com/api/auth/google/session" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "invalid_test"}'

# Should return 400 for missing session_id
curl -X POST "https://marketplace-test-21.preview.emergentagent.com/api/auth/google/session" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Test Credentials
See /app/memory/test_credentials.md
