# --- build stage ---
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
# tests need a real Postgres (see README): run them on the dev machine, not in the image build
RUN mvn -B -q package -DskipTests \
 && cp target/nalog-service-*.jar /build/app.jar

# --- runtime stage ---
FROM eclipse-temurin:17-jre
ENV TZ=Europe/Belgrade \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError"
WORKDIR /app
COPY --from=build /build/app.jar ./app.jar
# numeric uid so the host data folder can be chowned to it (see deploy/setup.sh)
RUN mkdir -p /data/photos && chown -R 10001:10001 /data
USER 10001
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8081' || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
