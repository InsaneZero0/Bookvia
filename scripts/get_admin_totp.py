#!/usr/bin/env python3
import asyncio
import os
import pyotp
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

async def get_totp():
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
    db = client[os.environ.get("DB_NAME", "bookvia")]
    admin = await db.users.find_one({"email": "zamorachapa50@gmail.com"}, {"_id": 0, "totp_secret": 1})
    if admin and admin.get("totp_secret"):
        print(pyotp.TOTP(admin["totp_secret"]).now())
    client.close()

asyncio.run(get_totp())
