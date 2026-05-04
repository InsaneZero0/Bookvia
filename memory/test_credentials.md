# Test Credentials

## Super Admin
- Email: zamorachapa50@gmail.com
- Password: RainbowLol3133!
- TOTP: Required (use /app/scripts/get_admin_totp.py to generate codes)
- Login endpoint: POST /api/auth/admin/login with {email, password, totp_code}
- public_code: backfilled (CL-XXXXX visible in DB)

## Staff (create via Super Admin panel)
- Login: same endpoint POST /api/auth/admin/login
- TOTP: NOT required (use totp_code: "000000")
- Permissions: assigned per tab (overview, businesses, users, etc.)

## Business (Test)
- testbiz_dashboard@test.com / TestBiz123!   (basic dashboard, no bookings)
- testspa@test.com / Test123!                (has 10 bookings with registered clients — good for Mini-CRM + public_code tests)
- testrealstripe@bookvia.com                 (has 17 bookings; password not tracked — can be reset if needed)

## User (Test)
- test@example.com / TestPass123!            (refreshed Feb 2026 for Phase 18 tests)
- testuser_stats@test.com / TestPass123!     (has phone verification passed)
- testuser_234504@bookvia.com                (public_code=CL-2GV7B; use for lookup tests)
