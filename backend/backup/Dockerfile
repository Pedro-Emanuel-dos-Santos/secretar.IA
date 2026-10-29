FROM redis:8.2@sha256:99ffb973380cc2f47bca06bd094f7f8c7138a0879a63cb8939896a22b7a65bba AS redis_tools
FROM postgres:18@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-psycopg python3-redis age rclone ca-certificates libatomic1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 11001 --create-home secretaria_backup
COPY --from=redis_tools /usr/local/bin/redis-cli /usr/local/bin/redis-check-rdb /usr/local/bin/redis-server /usr/local/bin/
WORKDIR /opt/backup
COPY backup.py test_backup.py ./
USER secretaria_backup
# No schedule, credentials or production access is configured by this image.
ENTRYPOINT ["python3", "/opt/backup/backup.py"]
CMD ["plan"]
