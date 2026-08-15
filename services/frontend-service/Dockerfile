# ================================================================
# FILE: Dockerfile
# PURPOSE: Build the NovaPay frontend into an NGINX container
# HOW IT WORKS:
#   1. Copies index.html, style.css, app.js into an NGINX image
#   2. Copies the custom nginx.conf
#   3. NGINX serves the files on port 80
# ================================================================

FROM nginx:1.25-alpine

# Remove default NGINX content
RUN rm -rf /usr/share/nginx/html/*

# Copy frontend files into NGINX serve directory
COPY index.html /usr/share/nginx/html/
COPY style.css  /usr/share/nginx/html/
COPY app.js     /usr/share/nginx/html/

# Copy custom NGINX configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
