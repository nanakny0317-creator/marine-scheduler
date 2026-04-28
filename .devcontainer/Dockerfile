FROM mcr.microsoft.com/devcontainers/javascript-node:20-bullseye

# Electron build & runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    libgtk-3-0 libnotify4 libnss3 \
    libxss1 libasound2 libxtst6 \
    libx11-xcb1 libxcb-dri3-0 libdrm2 libgbm1 \
    xvfb x11-utils \
    fakeroot rpm \
    && rm -rf /var/lib/apt/lists/*

# --- Windows installer build (Wine + NSIS) ---
# Linux から Windows .exe をビルドしたい場合はコメントを外す
# RUN dpkg --add-architecture i386 \
#     && apt-get update \
#     && apt-get install -y wine wine32 \
#     && rm -rf /var/lib/apt/lists/*
