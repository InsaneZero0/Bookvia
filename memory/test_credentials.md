# Test Credentials

## Super Admin
- Email: zamorachapa50@gmail.com
- Password: RainbowLol3133!
- TOTP: Required (use /app/scripts/get_admin_totp.py to generate codes)
- Login endpoint: POST /api/auth/admin/login with {email, password, totp_code}

## Staff (create via Super Admin panel)
- Login: same endpoint POST /api/auth/admin/login
- TOTP: NOT required (use totp_code: "000000")
- Permissions: assigned per tab (overview, businesses, users, etc.)

## Business (Test)
- Email: testrealstripe@bookvia.com
- Email: testbiz_dashboard@test.com / TestBiz123!

## User (Test)
- Email: test@test.com
- Email: testuser_stats@test.com / TestPass123!
