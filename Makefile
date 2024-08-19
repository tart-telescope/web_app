
BUILD=$(shell git rev-parse --short HEAD) 
BASE_URL="/viewer" 

test:
	docker compose -f docker-compose-test.yml up --build

deploy:
	CI_COMMIT_SHA=${BUILD} BASE_URL="/viewer" docker compose build
	CI_COMMIT_SHA=${BUILD} BASE_URL="/viewer" docker compose down 
	CI_COMMIT_SHA=${BUILD} BASE_URL="/viewer" docker compose up -d
	rm -rf ./html # deleting old build files
	CI_COMMIT_SHA=${BUILD} BASE_URL="/viewer" docker compose cp frontend:/usr/share/nginx/html .
	cd html/viewer; tar -cf web_app.tar --exclude web_app.tar ./
	rsync -rv html/viewer/ tart@tart.elec.ac.nz:~/caddy/html
	rm -rf ./html # deleting build files
