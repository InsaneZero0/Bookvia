# Bookvia - PRD (Product Requirements Document)

## Project Overview
**Bookvia** - Marketplace de Reservas Profesionales (tipo OpenTable multi-industria)
- Plataforma para reservar citas con profesionistas y negocios
- Multi-país, multi-idioma (ES/EN), multi-moneda (MXN)
- API-first, preparada para futura app móvil

## Architecture
- **Backend**: FastAPI (Python) + MongoDB
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Auth**: JWT (roles: user, business, admin)
- **Payments**: Stripe (test keys, listo para producción)
- **SMS**: Mock (configurable para Twilio)
- **2FA**: TOTP (Google Authenticator)

## User Personas
1. **Usuario Final**: Busca y reserva servicios profesionales
2. **Negocio/Profesional**: Ofrece servicios y gestiona citas
3. **Admin**: Gestiona plataforma, aprueba negocios, auditoría

## Core Requirements (Static)
- Sistema de citas con límite 5 activas por usuario
- 4 cancelaciones = suspensión 15 días
- Reagendar permitido >24h antes
- Anticipos con comisión 8%
- Verificación telefónica obligatoria
- Aprobación manual de negocios
- Planes: $49.99 MXN/mes (3 meses trial gratis)

## What's Been Implemented ✅ (Feb 22, 2026)

### Backend APIs
- ✅ Auth: register, login, phone verification (mock SMS)
- ✅ Admin 2FA: TOTP setup, verify, login with backup codes
- ✅ Categories CRUD (8 seeded)
- ✅ Businesses: search, featured, CRUD, workers, schedule
- ✅ Services CRUD
- ✅ Bookings: create, availability, confirm, complete, cancel
- ✅ Reviews: create, Bayesian rating
- ✅ Payments: Stripe checkout session
- ✅ Notifications: internal system
- ✅ Admin: stats, approve/reject businesses, audit logs

### Frontend Pages
- ✅ Homepage (hero, search, categories, how it works, CTA)
- ✅ Search/Filter page
- ✅ Login/Register pages
- ✅ Business Profile page (services, workers, reviews, booking flow)
- ✅ User Dashboard & Bookings
- ✅ Business Dashboard
- ✅ Admin Dashboard (pending review approval)
- ✅ Theme toggle (light/dark)
- ✅ Language toggle (ES/EN)

### Design
- ✅ Paleta: Azul profesional + Coral vibrante
- ✅ Tipografía: Manrope (headings) + Inter (body)
- ✅ Responsive design
- ✅ Estilo Airbnb/OpenTable

## Prioritized Backlog

### P0 (Critical - Next)
- [ ] Business registration form complete
- [ ] Full booking payment flow with Stripe
- [ ] Email notifications (templates)
- [ ] Phone verification UI flow

### P1 (Important)
- [ ] Business photos upload
- [ ] Worker vacation/blocked slots management
- [ ] Review response from business
- [ ] User payment methods management

### P2 (Nice to have)
- [ ] SEO: sitemap, meta tags, schema markup
- [ ] City/Category landing pages
- [ ] Business analytics dashboard
- [ ] Push notifications (future app)

## Next Tasks
1. Complete business registration flow with document upload
2. Implement full Stripe payment flow for deposits
3. Add email notification templates
4. Phone verification confirmation screen
5. Worker schedule management UI
