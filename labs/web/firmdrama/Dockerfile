FROM ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517

WORKDIR /opt/firmdrama

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends python3 python3-pip mysql-server ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 firmdrama \
    && useradd --system --uid 10001 --gid firmdrama --home-dir /opt/firmdrama --shell /usr/sbin/nologin firmdrama

COPY src/requirements.txt ./src/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r ./src/requirements.txt

# Runtime uses installed libraries only; package installers are build tools.
RUN apt-get purge -y python3-pip python3-setuptools python3-wheel \
    && rm -rf /usr/lib/python3.12/ensurepip /root/.cache

COPY database ./database
COPY src ./src
COPY scripts ./scripts
COPY solver ./solver
COPY tests /opt/firmdrama-tests
COPY entrypoint.sh ./

RUN chmod +x entrypoint.sh scripts/*.sh \
    && mkdir -p /home/olivia/DoNotOpenThisFolder \
    && chown -R root:root /opt/firmdrama

EXPOSE 8000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

USER firmdrama
CMD ["/opt/firmdrama/entrypoint.sh"]
