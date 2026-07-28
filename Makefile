.PHONY: dev dev-api dev-web seed build run check

dev:
	@trap 'kill 0' INT TERM EXIT; $(MAKE) dev-api & $(MAKE) dev-web

dev-api:
	APP_ORIGIN=$${APP_ORIGIN:-http://192.168.1.121:8080} go run .

dev-web:
	npm --prefix web run dev

seed:
	go run . seed

build:
	npm --prefix web run build
	go build -o bin/insta-helper .

run: build
	./bin/insta-helper

check:
	go test ./...
	npm --prefix web run typecheck
	npm --prefix web run build
