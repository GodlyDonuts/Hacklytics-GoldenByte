# VectorDB Integration

This directory contains scripts and configurations for deploying and populating the **Actian VectorAI DB** on a high-compute Vultr instance. 

We utilize a 32 vCPU Vultr instance to rapidly compute vector embeddings for ~8,000 project records stored in Databricks using the `sentence-transformers/all-mpnet-base-v2` model.

## Folder Contents
- `.env` - Contains credentials for Vultr server (IP, username, password).
- `setup_vultr.sh` - Bash script to install Docker, Docker Compose, clone the Actian VectorDB repo, start the database on port `50051`, and prepare a Python virtual environment with dependencies.
- `vectorize_and_load.py` - Core Python script that extracts SQL data from Databricks using `EXTERNAL_LINKS` extraction, computes the 768-dimensional text embeddings in batches, and uses the `cortex` async Python client to insert the records and payloads into the Actian database collection `projects`.
- `test_search.py` - Validation script that sends a sample vector query to the VectorDB to ensure context semantic matching works with payloads attached.

## Setup Instructions

1. SSH into the Vultr Node and run the setup script:
```bash
ssh root@<VULTR_IP>
bash /root/setup_vultr.sh
```

2. Activate the python environment and run the embedding ingestion pipeline:
```bash
source /root/.venv/bin/activate
python /root/vectorize_and_load.py
```

3. Ensure data is correctly loaded by testing a semantic search:
```bash
python /root/test_search.py
```

## Technologies
- [Actian VectorAI DB Beta](https://github.com/hackmamba-io/actian-vectorAI-db-beta)
- [sentence-transformers/all-mpnet-base-v2](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- Databricks API
