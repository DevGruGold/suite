FROM python:3.11-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git gcc g++ libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast package management
RUN pip install uv --no-cache-dir

# Install JupyterLab + collaboration + MCP tools + data science stack
RUN pip install --no-cache-dir \
    jupyterlab==4.4.1 \
    jupyter-collaboration==4.0.2 \
    jupyter-mcp-tools>=0.1.4 \
    ipykernel \
    && pip uninstall -y pycrdt datalayer_pycrdt \
    && pip install --no-cache-dir datalayer_pycrdt==0.12.17

# Data science + AI libraries available in notebooks
RUN pip install --no-cache-dir \
    pandas>=2.0.0 \
    numpy>=1.24.0 \
    polars>=0.18.0 \
    scikit-learn>=1.3.0 \
    matplotlib>=3.7.0 \
    seaborn>=0.12.0 \
    plotly>=5.15.0 \
    requests>=2.31.0 \
    pillow>=10.0.0 \
    beautifulsoup4>=4.12.0 \
    httpx>=0.24.0 \
    pyarrow>=12.0.0 \
    openpyxl>=3.1.0

# Create notebooks directory
RUN mkdir -p /notebooks

WORKDIR /notebooks

# Cloud Run provides PORT env var; Jupyter binds to it
ENV JUPYTER_TOKEN=""
ENV PORT=8888

EXPOSE 8888

# Healthcheck — Cloud Run requires the container to respond on PORT
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api || exit 1

CMD jupyter lab \
    --port=${PORT} \
    --ip=0.0.0.0 \
    --no-browser \
    --allow-root \
    --IdentityProvider.token=${JUPYTER_TOKEN} \
    --ServerApp.allow_origin='*' \
    --ServerApp.disable_check_xsrf=True
