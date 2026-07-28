.PHONY: db-up db-down dev dev-api dev-web seed build run check

DATABASE_URL ?= postgres://postgres:postgres@localhost:5433/insta_helper?sslmode=disable
TEST_DATABASE_URL ?= postgres://postgres:postgres@localhost:5433/insta_helper?sslmode=disable
export DATABASE_URL TEST_DATABASE_URL

db-up:
	docker compose up -d --wait db

db-down:
	docker compose down

dev: db-up
	@trap 'kill 0' INT TERM EXIT; $(MAKE) dev-api & $(MAKE) dev-web

dev-api:
	APP_ORIGIN=$${APP_ORIGIN:-http://192.168.1.121:8080} go run .

dev-web:
	npm --prefix web run dev

seed: db-up
	go run . seed

build:
	npm --prefix web run build
	go build -o bin/insta-helper .

run: build
	./bin/insta-helper

check: db-up
	go test ./...
	npm --prefix web run typecheck
	npm --prefix web run build
