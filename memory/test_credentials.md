# Test Credentials for Bookvia

## Business Account (Owner - full access)
- Email: testrealstripe@bookvia.com
- Password: Test1234!
- Business Name: Test Real Stripe
- Status: approved
- Login: /business/login -> tab "Negocio" -> "Soy el dueno"

## Administrator Account (restricted access by permissions)
- Business Email: testrealstripe@bookvia.com
- Worker Name: Test Worker Duration
- Worker ID: e8156189-9cc2-4b3d-9f0e-2df518915bda
- PIN: 1234
- Login: /business/login -> tab "Negocio" -> "Soy administrador"
- Permissions (16 total):
  - view_today_bookings=true
  - view_confirmed_bookings=true
  - view_agenda=true
  - view_team=false
  - complete_bookings=true
  - reschedule_bookings=true
  - cancel_bookings=false
  - block_clients=false
  - view_client_data=true
  - edit_services=false
  - view_reports=false
  - edit_photos=false
  - edit_description=false
  - edit_schedule=false
  - edit_contact=false

## Regular User Account
- Email: cliente@bookvia.com
- Password: Test1234!
- Email Verified: Yes

## Admin Account (System Admin)
- Email: zamorachapa50@gmail.com
- Password: RainbowLol3133!

## Login URLs
- /business/login (select "Negocio" tab, then "Soy el dueno" or "Soy administrador")
- /login (default "Usuario" tab)
- /admin/login (system admin)
