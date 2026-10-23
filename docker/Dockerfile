# syntax=docker/dockerfile:1.7
# ---- build stage: UBI 9 with OpenJDK 17 and Maven ------------------------------------------
FROM registry.access.redhat.com/ubi9/openjdk-17:latest AS build
USER 0
WORKDIR /build
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests package \
 && java -Djarmode=tools -jar target/trade-capture.jar extract --layers --destination /build/layers

# ---- runtime stage: UBI 9 OpenJDK 17 runtime (JRE only, no Maven, no compiler) ---------------
FROM registry.access.redhat.com/ubi9/openjdk-17-runtime:latest
LABEL org.opencontainers.image.title="trade-capture" \
      org.opencontainers.image.source="https://git.example.com/trading/trade-capture"

WORKDIR /deployments
# Layers ordered from least to most frequently changed, so a code-only change re-pushes ~100 KB.
COPY --from=build --chown=185:0 /build/layers/dependencies/ ./
COPY --from=build --chown=185:0 /build/layers/spring-boot-loader/ ./
COPY --from=build --chown=185:0 /build/layers/snapshot-dependencies/ ./
COPY --from=build --chown=185:0 /build/layers/application/ ./

USER 185
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", "-jar", "trade-capture.jar"]
