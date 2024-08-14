export CI_COMMIT_SHA=$(git rev-parse --short HEAD) && docker compose build && docker compose up
