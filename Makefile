BUILD=$(shell git rev-parse --short HEAD)
BASE_URL="/viewer"

# Build variant images directly
build-variants:
	# Build root variant
	CI_COMMIT_SHA=${BUILD} docker build \
		-t ghcr.io/tart-telescope/web_app/viewer-root:${BUILD}-amd64 \
		-t ghcr.io/tart-telescope/web_app/viewer-root:latest \
		--build-arg CI_PROJECT_NAME=viewer \
		--build-arg BASE_URL="" \
		--build-arg CI_COMMIT_SHA=${BUILD} .
	# Build subpath variant
	CI_COMMIT_SHA=${BUILD} docker build \
		-t ghcr.io/tart-telescope/web_app/viewer-subpath:${BUILD}-amd64 \
		-t ghcr.io/tart-telescope/web_app/viewer-subpath:latest \
		--build-arg CI_PROJECT_NAME=viewer \
		--build-arg BASE_URL="/viewer" \
		--build-arg CI_COMMIT_SHA=${BUILD} .

# Extract assets from variant images
extract-assets: build-variants
	mkdir -p assets-root assets-subpath
	# Create temporary containers and copy files out
	docker create --name temp-root ghcr.io/tart-telescope/web_app/viewer-root:${BUILD}-amd64
	docker cp temp-root:/usr/share/nginx/html/. ./assets-root/
	docker rm temp-root
	docker create --name temp-subpath ghcr.io/tart-telescope/web_app/viewer-subpath:${BUILD}-amd64
	docker cp temp-subpath:/usr/share/nginx/html/viewer/. ./assets-subpath/
	docker rm temp-subpath

# Build multi-platform Docker images (optional for local development)
build-docker: extract-assets
	# Create multi-arch Dockerfile
	echo 'FROM nginx:stable-alpine' > Dockerfile.multiarch
	echo 'ARG BASE_URL' >> Dockerfile.multiarch
	echo 'ENV BASE_URL=$$BASE_URL' >> Dockerfile.multiarch
	echo 'COPY nginx.conf.template /etc/nginx/nginx.conf.template' >> Dockerfile.multiarch
	echo 'COPY assets /usr/share/nginx/html$$BASE_URL/' >> Dockerfile.multiarch
	echo '' >> Dockerfile.multiarch
	echo 'RUN envsubst '"'"'$${BASE_URL}'"'"' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf' >> Dockerfile.multiarch
	echo '' >> Dockerfile.multiarch
	echo 'EXPOSE 80' >> Dockerfile.multiarch
	# Build root variant
	cp -r assets-root ./assets
	docker buildx build --platform linux/amd64,linux/arm64 \
		-f Dockerfile.multiarch \
		-t ghcr.io/tart-telescope/web_app/viewer-root:${BUILD} \
		-t ghcr.io/tart-telescope/web_app/viewer-root:latest \
		--build-arg BASE_URL="" \
		--load .
	rm -rf assets
	# Build subpath variant
	cp -r assets-subpath ./assets
	docker buildx build --platform linux/amd64,linux/arm64 \
		-f Dockerfile.multiarch \
		-t ghcr.io/tart-telescope/web_app/viewer-subpath:${BUILD} \
		-t ghcr.io/tart-telescope/web_app/viewer-subpath:latest \
		--build-arg BASE_URL="/viewer" \
		--load .
	rm -rf assets assets-root assets-subpath Dockerfile.multiarch

# Build and test proxy service
build-proxy:
	cd tart-viewer && docker compose up --build -d
	cd tart-viewer && docker compose down

# Build all services
build-all: build-variants build-proxy

# Clean build artifacts
clean:
	rm -rf assets-root assets-subpath assets Dockerfile.multiarch Dockerfile.variant
	docker system prune -f

# Help target
help:
	@echo "Available targets:"
	@echo "  build-variants  - Build app variants with different BASE_URL"
	@echo "  build-docker    - Build multi-platform Docker images (optional)"
	@echo "  build-all       - Build everything (variants + proxy)"
	@echo "  extract-assets  - Extract static assets from variant images"
	@echo "  build-proxy     - Build and test nginx proxy service"
	@echo "  test           - Test with docker-compose"
	@echo "  local          - Build locally with docker-compose"
	@echo "  deploy         - Deploy to tart.elec.ac.nz (legacy)"
	@echo "  clean          - Clean build artifacts"

# Legacy targets for compatibility
test:
	CI_COMMIT_SHA=${BUILD}-local docker compose up --build

local:
	CI_COMMIT_SHA=${BUILD}-local docker compose build

# Legacy deploy target (using old docker-compose method)
legacy-deploy:
	@echo "Warning: This is the legacy deploy method"
	@echo "Consider using the new multi-platform images instead:"
	@echo "  ghcr.io/tart-telescope/web_app/viewer-subpath:latest"
	CI_COMMIT_SHA=${BUILD} BASE_URL=${BASE_URL} docker compose up --build -d
	rm -rf ./html # deleting old build files
	CI_COMMIT_SHA=${BUILD} BASE_URL=${BASE_URL} docker compose cp frontend-viewer:/usr/share/nginx/html .
	cd html/viewer; tar -cf web_app.tar --exclude web_app.tar ./
	rsync -rv html/viewer/ tart@tart.elec.ac.nz:~/caddy/html
	rm -rf ./html # deleting build files

.PHONY: help build-variants build-docker build-all extract-assets build-proxy test local deploy clean
.DEFAULT_GOAL := help
