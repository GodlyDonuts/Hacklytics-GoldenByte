#!/bin/bash
cd /root

echo "Installing OS dependencies..."
apt-get update && apt-get install -y python3-venv python3-pip git

echo "Setting up Actian Vector DB Repository..."
if [ ! -d "actian-vectorAI-db-beta" ]; then
    git clone https://github.com/hackmamba-io/actian-vectorAI-db-beta.git
fi

cd actian-vectorAI-db-beta
echo "Updating docker-compose.yml image tag to williamimoh/actian-vectorai-db:1.0b..."
sed -i 's|image: .*|image: williamimoh/actian-vectorai-db:1.0b|' docker-compose.yml
docker compose up -d

cd /root
echo "Setting up Python Virtual Environment..."
python3 -m venv .venv
source .venv/bin/activate

echo "Installing pip dependencies..."
pip install httpx sentence-transformers python-dotenv
echo "Installing Cortex Vector DB Client..."
pip install actian-vectorAI-db-beta/actiancortex-0.1.0b1-py3-none-any.whl

echo "Virtual environment setup complete. DB should be starting on port 50051."
