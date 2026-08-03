.PHONY: db-up db-down dev dev-api dev-web seed build run check image release

DATABASE_URL ?= postgres://postgres:postgres@localhost:5433/insta_helper?sslmode=disable
TEST_DATABASE_URL ?= postgres://postgres:postgres@localhost:5433/insta_helper?sslmode=disable
IMAGE ?= insta-helper
TAG ?= $(shell git describe --always --dirty)
PLATFORM ?= linux/amd64
DIST_DIR ?= dist
ARCHIVE = $(IMAGE)-$(TAG).tar.gz
export DATABASE_URL TEST_DATABASE_URL

db-up:
	docker compose up -d --wait db

db-down:
	docker compose down

dev: db-up
	@trap 'kill 0' INT TERM EXIT; $(MAKE) dev-api & $(MAKE) dev-web

dev-api:
	APP_ORIGIN=$${APP_ORIGIN:-http://192.168.210.213:8080} go run .

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

image:
	docker build --platform $(PLATFORM) -t $(IMAGE):$(TAG) .

release: check image
	mkdir -p $(DIST_DIR)
	docker image save -o $(DIST_DIR)/$(IMAGE)-$(TAG).tar $(IMAGE):$(TAG)
	gzip -f $(DIST_DIR)/$(IMAGE)-$(TAG).tar
	cd $(DIST_DIR) && sha256sum $(ARCHIVE) > $(ARCHIVE).sha256 && sha256sum -c $(ARCHIVE).sha256
	@printf 'release: %s/%s\n' $(DIST_DIR) $(ARCHIVE)
