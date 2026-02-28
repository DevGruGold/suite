FROM python:3.11-slim

# ── Security: create a non-root user before anything else ────────────────────
RUN groupadd --system appgroup && useradd --system --gid appgroup --home /app appuser

WORKDIR /app

# ── System dependencies for scipy, lxml, Pillow, scikit-image ────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libgomp1 \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Pin pip itself, then install the security auditor ────────────────────────
RUN pip install --no-cache-dir "pip==25.0.1" "pip-audit==2.8.0"

# ── Install application dependencies ─────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Build-time CVE security audit — FAILS the build on medium+ severity CVEs ─
# This is the critical step that ensures we pass security audits like Socket/Snyk.
# To bypass during dev only: docker build --build-arg SKIP_AUDIT=1 ...
ARG SKIP_AUDIT=0
RUN if [ "$SKIP_AUDIT" != "1" ]; then \
      pip-audit -r requirements.txt --severity medium --format json -o /tmp/audit.json \
      && echo "✅ pip-audit: No medium+ CVEs found" \
      || (echo "❌ pip-audit: CVEs detected! Review /tmp/audit.json" && cat /tmp/audit.json && exit 1); \
    fi

# ── Copy application code ─────────────────────────────────────────────────────
COPY app.py .

# ── Drop to non-root user for runtime ────────────────────────────────────────
RUN chown -R appuser:appgroup /app
USER appuser

# ── Environment ───────────────────────────────────────────────────────────────
ENV PORT=8080
# Suppress Python bytecode files (.pyc) — smaller attack surface
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Force matplotlib into non-interactive Agg backend (no display needed)
ENV MPLBACKEND=Agg

# ── Production server ─────────────────────────────────────────────────────────
# 1 worker (subprocess-heavy workload), 8 threads for concurrency.
# Timeout 0 = defer to per-request timeout handled in application code.
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app
