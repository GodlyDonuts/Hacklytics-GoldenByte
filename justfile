project := justfile_directory()
backend := project / "backend"
frontend := project / "frontend"

# List available recipes
default:
    @just --list

# Start the backend server
backend:
    source {{backend}}/venv/bin/activate && uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Start the frontend dev server
frontend:
    cd {{frontend}} && npm run dev

# Run the frontend build check
build:
    cd {{frontend}} && npx next build

# Test the Genie endpoint
test-genie question="top 5 countries by severity":
    curl -s -X POST http://localhost:8000/api/genie \
        -H "Content-Type: application/json" \
        -d '{"question":"{{question}}"}' | python3 -m json.tool
