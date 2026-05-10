"""
Phase H — Categories restructure (Feb 2026).

Migrates the 10 legacy categories into a 2-tier taxonomy:
  - 12 parent categories (clear, non-overlapping)
  - Subcategories grouped under each parent (used as multi-select chips)

Old → new mapping (slug-level):
  belleza-estetica          → belleza-estetica         (kept)
  salud                     → salud-medicos
  fitness-bienestar         → fitness-deportes
  spa-masajes               → spa-masajes              (kept)
  servicios-legales         → servicios-profesionales
  consultoria               → servicios-profesionales
  automotriz                → automotriz               (kept)
  veterinaria               → mascotas
  salones-servicios-eventos → eventos-banquetes
  otro                      → otros-servicios
  + new: bienestar-terapias, educacion, hogar-reparaciones

Each business is updated to point to its new parent category.
"""
import asyncio
import os
import sys
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")

# Parent categories (level 1)
PARENT_CATEGORIES = [
    {"slug": "belleza-estetica", "name_es": "Belleza y Estética", "name_en": "Beauty & Aesthetics", "icon": "scissors"},
    {"slug": "spa-masajes", "name_es": "Spa y Masajes", "name_en": "Spa & Massage", "icon": "flower"},
    {"slug": "salud-medicos", "name_es": "Salud y Médicos", "name_en": "Health & Medical", "icon": "stethoscope"},
    {"slug": "fitness-deportes", "name_es": "Fitness y Deportes", "name_en": "Fitness & Sports", "icon": "dumbbell"},
    {"slug": "bienestar-terapias", "name_es": "Bienestar y Terapias", "name_en": "Wellness & Therapy", "icon": "leaf"},
    {"slug": "eventos-banquetes", "name_es": "Eventos y Banquetes", "name_en": "Events & Banquets", "icon": "party-popper"},
    {"slug": "servicios-profesionales", "name_es": "Servicios Profesionales", "name_en": "Professional Services", "icon": "briefcase"},
    {"slug": "automotriz", "name_es": "Automotriz", "name_en": "Automotive", "icon": "car"},
    {"slug": "mascotas", "name_es": "Mascotas", "name_en": "Pets", "icon": "paw-print"},
    {"slug": "educacion", "name_es": "Educación", "name_en": "Education", "icon": "graduation-cap"},
    {"slug": "hogar-reparaciones", "name_es": "Hogar y Reparaciones", "name_en": "Home & Repairs", "icon": "home"},
    {"slug": "otros-servicios", "name_es": "Otros servicios", "name_en": "Other services", "icon": "package"},
]

# Subcategories: key=parent slug, value=list of {slug, name_es, name_en}
SUBCATEGORIES = {
    "belleza-estetica": [
        ("salon-cabello", "Salón de cabello", "Hair salon"),
        ("barberia", "Barbería", "Barbershop"),
        ("unas", "Uñas", "Nails"),
        ("cejas-pestanas", "Cejas y pestañas", "Brows & lashes"),
        ("maquillaje", "Maquillaje", "Makeup"),
        ("depilacion", "Depilación", "Hair removal"),
        ("tatuajes-piercing", "Tatuajes y Piercing", "Tattoo & Piercing"),
        ("bronceado", "Bronceado", "Tanning"),
    ],
    "spa-masajes": [
        ("masaje-relajante", "Masaje relajante", "Relaxing massage"),
        ("masaje-deportivo", "Masaje deportivo", "Sports massage"),
        ("faciales", "Faciales", "Facials"),
        ("corporales", "Tratamientos corporales", "Body treatments"),
        ("hammam", "Hammam", "Hammam"),
        ("flotacion", "Flotación", "Float therapy"),
    ],
    "salud-medicos": [
        ("dental", "Dental", "Dental"),
        ("nutricion", "Nutrición", "Nutrition"),
        ("psicologia", "Psicología", "Psychology"),
        ("fisioterapia", "Fisioterapia", "Physical therapy"),
        ("quiropractica", "Quiropráctica", "Chiropractic"),
        ("podologia", "Podología", "Podiatry"),
        ("medicina-general", "Consulta médica general", "General medicine"),
    ],
    "fitness-deportes": [
        ("gimnasio", "Gimnasio", "Gym"),
        ("crossfit", "Crossfit", "Crossfit"),
        ("yoga", "Yoga", "Yoga"),
        ("pilates", "Pilates", "Pilates"),
        ("boxeo", "Boxeo", "Boxing"),
        ("entrenador-personal", "Entrenador personal", "Personal trainer"),
        ("spinning", "Spinning", "Spinning"),
        ("natacion", "Natación", "Swimming"),
    ],
    "bienestar-terapias": [
        ("terapia-holistica", "Terapia holística", "Holistic therapy"),
        ("reiki", "Reiki", "Reiki"),
        ("acupuntura", "Acupuntura", "Acupuncture"),
        ("meditacion", "Meditación", "Meditation"),
        ("aromaterapia", "Aromaterapia", "Aromatherapy"),
        ("coaching", "Coaching de vida", "Life coaching"),
    ],
    "eventos-banquetes": [
        ("salon-eventos", "Salón de eventos", "Event venue"),
        ("banquetes", "Banquetes", "Catering"),
        ("dj", "DJ", "DJ"),
        ("decoracion-eventos", "Decoración", "Decoration"),
        ("mariachi", "Mariachi", "Mariachi"),
        ("animacion-infantil", "Animación infantil", "Kids entertainment"),
    ],
    "servicios-profesionales": [
        ("legal", "Legal", "Legal"),
        ("contable", "Contable", "Accounting"),
        ("notarial", "Notarial", "Notary"),
        ("consultoria", "Consultoría", "Consulting"),
        ("asesoria-fiscal", "Asesoría fiscal", "Tax advisory"),
    ],
    "automotriz": [
        ("mecanica", "Mecánica", "Mechanic"),
        ("hojalateria", "Hojalatería", "Body shop"),
        ("lavado", "Lavado", "Car wash"),
        ("detailing", "Detailing", "Detailing"),
        ("llantas", "Llantas", "Tires"),
        ("polarizado", "Polarizado", "Window tinting"),
    ],
    "mascotas": [
        ("veterinaria", "Veterinaria", "Veterinary"),
        ("estetica-canina", "Estética canina", "Pet grooming"),
        ("guarderia-mascotas", "Guardería", "Pet daycare"),
        ("paseador", "Paseador", "Dog walking"),
        ("adiestramiento", "Adiestramiento", "Pet training"),
    ],
    "educacion": [
        ("tutorias", "Tutorías", "Tutoring"),
        ("idiomas", "Idiomas", "Languages"),
        ("musica", "Música", "Music"),
        ("arte", "Arte", "Art"),
        ("regularizacion", "Regularización", "Make-up lessons"),
        ("preparacion-examen", "Preparación de examen", "Test prep"),
    ],
    "hogar-reparaciones": [
        ("plomeria", "Plomería", "Plumbing"),
        ("electricidad", "Electricidad", "Electrical"),
        ("limpieza", "Limpieza", "Cleaning"),
        ("jardineria", "Jardinería", "Gardening"),
        ("pintura", "Pintura", "Painting"),
        ("carpinteria", "Carpintería", "Carpentry"),
        ("cerrajeria", "Cerrajería", "Locksmith"),
    ],
    "otros-servicios": [
        ("fotografia", "Fotografía", "Photography"),
        ("video", "Video", "Video"),
        ("reparacion-electronicos", "Reparación de electrónicos", "Electronics repair"),
        ("otro", "Otro", "Other"),
    ],
}

# Old slug -> New parent slug map (for migration)
LEGACY_MAP = {
    "belleza-estetica": "belleza-estetica",
    "salud": "salud-medicos",
    "fitness-bienestar": "fitness-deportes",
    "spa-masajes": "spa-masajes",
    "servicios-legales": "servicios-profesionales",
    "consultoria": "servicios-profesionales",
    "automotriz": "automotriz",
    "veterinaria": "mascotas",
    "salones-servicios-eventos": "eventos-banquetes",
    "otro": "otros-servicios",
}


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "bookvia")]

    # 1) Build slug -> id map for OLD categories
    old_cats = await db.categories.find({}, {"_id": 0, "id": 1, "slug": 1}).to_list(100)
    old_slug_to_id = {c["slug"]: c["id"] for c in old_cats}

    # 2) Upsert each parent category with stable id (slug-based)
    parent_slug_to_id = {}
    for p in PARENT_CATEGORIES:
        existing = await db.categories.find_one({"slug": p["slug"], "parent_id": None}, {"_id": 0, "id": 1})
        if existing:
            cat_id = existing["id"]
            await db.categories.update_one(
                {"id": cat_id},
                {"$set": {**p, "parent_id": None, "image_url": None}}
            )
        else:
            cat_id = str(uuid.uuid4())
            await db.categories.insert_one({
                "id": cat_id,
                **p,
                "parent_id": None,
                "image_url": None,
            })
        parent_slug_to_id[p["slug"]] = cat_id
        print(f"  parent  {p['slug']:30} -> {cat_id}")

    # 3) Insert/update subcategories under each parent
    sub_count = 0
    for parent_slug, subs in SUBCATEGORIES.items():
        parent_id = parent_slug_to_id[parent_slug]
        for slug, name_es, name_en in subs:
            existing = await db.categories.find_one({"slug": slug, "parent_id": parent_id}, {"_id": 0, "id": 1})
            doc = {
                "slug": slug,
                "name_es": name_es,
                "name_en": name_en,
                "parent_id": parent_id,
                "icon": "tag",
                "image_url": None,
            }
            if existing:
                await db.categories.update_one({"id": existing["id"]}, {"$set": doc})
            else:
                await db.categories.insert_one({"id": str(uuid.uuid4()), **doc})
            sub_count += 1
    print(f"  subcats inserted/updated: {sub_count}")

    # 4) Migrate businesses from OLD category_id -> NEW parent category_id
    migrated = 0
    for old_slug, new_slug in LEGACY_MAP.items():
        old_id = old_slug_to_id.get(old_slug)
        if not old_id:
            continue
        new_id = parent_slug_to_id[new_slug]
        if old_id == new_id:
            continue  # parent already at new id (should not happen)
        result = await db.businesses.update_many(
            {"category_id": old_id},
            {"$set": {"category_id": new_id}}
        )
        migrated += result.modified_count
        print(f"  migrated {old_slug} -> {new_slug}: {result.modified_count} businesses")

    # 5) Delete legacy categories that are no longer used (slug not in new parents)
    new_parent_slugs = {p["slug"] for p in PARENT_CATEGORIES}
    legacy_to_remove = [c for c in old_cats if c["slug"] not in new_parent_slugs]
    if legacy_to_remove:
        ids_to_remove = [c["id"] for c in legacy_to_remove]
        result = await db.categories.delete_many({"id": {"$in": ids_to_remove}, "parent_id": None})
        print(f"  removed legacy parent categories: {result.deleted_count}")

    print(f"\nDONE. Total businesses migrated: {migrated}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
