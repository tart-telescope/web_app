
deploy:
	docker compose build
	docker compose down && docker compose up -d
	rm -rf ./html # deleting old build files
	docker compose cp frontend:/usr/share/nginx/html .
	cd html/viewer; tar -cf web_app.tar ./ 
	rsync -rv html/viewer/ tart@tart.elec.ac.nz:~/caddy/html
	rm -rf ./html # deleting build files

