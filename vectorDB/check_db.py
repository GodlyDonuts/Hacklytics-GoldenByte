import os
import asyncio
import sys

# Add project root to path so we can import backend.services...
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

from backend.services.databricks_client import execute_sql

async def main():
    try:
        tables = await execute_sql("SHOW TABLES")
        print("TABLES:")
        for t in tables:
            print(f" - {t.get('tableName')}")

        for t in tables:
            table_name = t.get('tableName')
            if table_name:
                try:
                    count_res = await execute_sql(f"SELECT COUNT(*) as cnt FROM {table_name}")
                    print(f"Table {table_name} has {count_res[0]['cnt']} rows.")
                except Exception as e:
                    print(f"Could not count {table_name}: {e}")

    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
