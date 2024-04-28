
deploy:
	docker compose build
	docker compose down && docker compose up -d
	rm -rf ./html # deleting old build files
	docker compose cp frontend:/usr/share/nginx/html .
	rsync -rv html/viewer/ tart@tart.elec.ac.nz:~/caddy/html
	rm -rf ./html # deleting build files

