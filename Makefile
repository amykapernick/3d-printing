.PHONY: up down logs dev build clean pi-setup pi-images pi-deploy pi-service

# Full bundle (spoolman + pocketbase + built app) — the one command for a device/Pi.
up:
	docker-compose up --build

down:
	docker-compose down

logs:
	docker-compose logs -f

# Local development: backends in Docker, SvelteKit dev server with hot reload.
# The app defaults to localhost backends, so this is the single dev command.
dev:
	docker-compose up -d spoolman pocketbase
	cd app && npm run dev

build:
	cd app && npm ci && npm run build

# Wipe runtime data (keeps committed schema). Destructive.
clean:
	docker-compose down -v
	rm -rf pb_data data

# ---------------------------------------------------------------------------
# Raspberry Pi (arm64) — cross-build the images on this machine, ship them to
# the Pi, and run the bundle there as a systemd service.
#
#   make pi-setup    # one-time: QEMU + a buildx builder
#   make pi-deploy   # build arm64 images + push + start
#   make pi-service  # install the boot-on-start service
#
# Override PI (ssh target), PI_KEY (ssh identity) or PI_DIR (path on the Pi) on
# the command line, or set them once in a git-ignored `deploy.mk` next to this file.
# ---------------------------------------------------------------------------
-include deploy.mk
PI       ?= pi@raspberrypi.local
PI_KEY   ?= ~/.ssh/id_ed25519
PI_DIR   ?= ~/docker/3d-print-management
PLATFORM ?= linux/arm64
PI_USER   = $(firstword $(subst @, ,$(PI)))
SSH       = ssh -i $(PI_KEY)

# One-time on this (amd64) machine: register QEMU so it can build arm64 images,
# and create a buildx builder that supports exporting image tarballs.
pi-setup:
	docker run --privileged --rm tonistiigi/binfmt --install arm64
	docker buildx create --name pi-builder --driver docker-container --bootstrap \
		--use 2>/dev/null || docker buildx use pi-builder

# Cross-build both images for the Pi and save them as loadable tarballs in dist/.
# (Spoolman is pulled straight from its registry on the Pi — already multi-arch.)
pi-images:
	mkdir -p dist
	docker buildx build --builder pi-builder --platform $(PLATFORM) \
		-t 3dpm-app ./app -o type=docker,dest=dist/app.tar
	docker buildx build --builder pi-builder --platform $(PLATFORM) \
		-t 3dpm-pocketbase ./pocketbase -o type=docker,dest=dist/pocketbase.tar

# Build, copy images + run config to the Pi, load them, and (re)start the stack.
# Note: .env is NOT copied — create/edit it once on the Pi (it holds secrets).
pi-deploy: pi-images
	$(SSH) $(PI) 'mkdir -p $(PI_DIR)/dist'
	rsync -av -e "$(SSH)" docker-compose.yml Makefile pb_migrations pb_hooks systemd $(PI):$(PI_DIR)/
	rsync -av -e "$(SSH)" dist/app.tar dist/pocketbase.tar $(PI):$(PI_DIR)/dist/
	$(SSH) $(PI) 'cd $(PI_DIR) && \
		docker load -i dist/app.tar && docker load -i dist/pocketbase.tar && \
		docker compose up -d'

# Install the systemd unit on the Pi so the bundle starts on every boot.
# Resolves PI_DIR to an absolute path and fills in the User/WorkingDirectory.
pi-service:
	$(SSH) $(PI) 'mkdir -p $(PI_DIR)'
	rsync -av -e "$(SSH)" systemd $(PI):$(PI_DIR)/
	$(SSH) $(PI) 'cd $(PI_DIR) && \
		sed -e "s|__USER__|$(PI_USER)|" -e "s|__DIR__|$$(pwd)|" \
			systemd/3d-print-management.service \
			| sudo tee /etc/systemd/system/3d-print-management.service >/dev/null && \
		sudo systemctl daemon-reload && \
		sudo systemctl enable --now 3d-print-management.service && \
		sudo systemctl status --no-pager 3d-print-management.service'
