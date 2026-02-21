import os
import asyncio
from dotenv import load_dotenv
load_dotenv("backend/.env")
from backend.services.databricks_client import execute_sql

async def main():
    print(f"HOST: {os.getenv('DATABRICKS_HOST')}")
    print(f"WH_ID: {os.getenv('WAREHOUSE_ID')}")
    try:
        res = await execute_sql("SELECT 1")
        print("Success!", res)
    except Exception as e:
        print("Error:", repr(e))

asyncio.run(main())
