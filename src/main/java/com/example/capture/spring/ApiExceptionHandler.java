package com.example.capture.spring;

import com.example.capture.core.NoteTerms;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Turns domain failures into RFC 9457 problem documents the browser can map onto form fields. */
@RestControllerAdvice
public class ApiExceptionHandler {

  /**
   * Handles failed term validation.
   *
   * @param e the exception carrying every failed rule
   * @return 422 with an {@code errors} array of {@code {field,message}}
   */
  @ExceptionHandler(NoteTerms.Invalid.class)
  public ProblemDetail invalid(NoteTerms.Invalid e) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, "Validation failed");
    List<Map<String, String>> errors =
        e.errors().stream()
            .map(err -> Map.of("field", err.field(), "message", err.message()))
            .toList();
    problem.setProperty("errors", errors);
    return problem;
  }

  /**
   * Handles unparsable JSON.
   *
   * @param e the parse failure
   * @return 400
   */
  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ProblemDetail unreadable(HttpMessageNotReadableException e) {
    return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Malformed request body");
  }
}
