package com.example.capture.spring;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Reads {@code X-Correlation-Id} (the browser sends {@code ui-<uuid>}), generates one if absent,
 * puts it in the logging context and echoes it on the response, so one click can be followed from
 * the browser console to the server log.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

  /** Header name shared with the Angular interceptor. */
  public static final String HEADER = "X-Correlation-Id";

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String incoming = request.getHeader(HEADER);
    String id = sane(incoming) ? incoming : "srv-" + UUID.randomUUID();
    MDC.put("correlationId", id);
    response.setHeader(HEADER, id);
    try {
      chain.doFilter(request, response);
    } finally {
      MDC.remove("correlationId");
    }
  }

  private static boolean sane(String id) {
    return id != null && id.length() <= 64 && id.matches("[A-Za-z0-9._-]+");
  }
}
