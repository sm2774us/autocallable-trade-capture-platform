package com.example.capture.spring;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Entry point of the trade-capture service. */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class CaptureApplication {

  /**
   * Starts the application.
   *
   * @param args command-line arguments
   */
  public static void main(String[] args) {
    SpringApplication.run(CaptureApplication.class, args);
  }
}
