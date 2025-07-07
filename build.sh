export CI_COMMIT_SHA=$(git rev-parse --short HEAD) && docker compose up --build
