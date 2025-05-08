# Base Image with Node.js
ARG NODE_VERSION=23.4.0
FROM node:${NODE_VERSION:-23.4.0}-alpine as base

# Install necessary packages
RUN apk add --no-cache git bash

# Set working directory
WORKDIR /usr/src/app

################################################################################
# Install dependencies
FROM base as deps

# Copy only package.json and yarn.lock first to leverage Docker cache
COPY package.json yarn.lock ./

# Set production environment
ENV NODE_ENV=production

# Install only production dependencies
RUN yarn install --frozen-lockfile --production

################################################################################
# Build application
FROM base as build

# Copy the entire source code
COPY . .

COPY proto ./proto

# Install all dependencies (needed for building)
RUN yarn install --frozen-lockfile

# Run the build script
RUN yarn run build

################################################################################
# Create final image for production
FROM base as final

# Set production environment
ENV NODE_ENV=production

# Use non-root user BEFORE copying files
USER node

# Set working directory
WORKDIR /usr/src/app

# Copy package.json for reference
COPY --chown=node:node package.json .

# Copy production dependencies
COPY --from=deps --chown=node:node /usr/src/app/node_modules ./node_modules

# Copy the built application
COPY --from=build --chown=node:node /usr/src/app/dist ./dist

COPY --from=build --chown=node:node /usr/src/app/proto ./proto

# Define the entrypoint
CMD ["node", "dist/main.js"]
