#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { performance } = require("perf_hooks");

// Configuration
const CONFIG = {
  ENVIRONMENTS: {
    development: {
      API_URL: "http://localhost:3000/api/v1",
      WS_URL: "http://localhost:3000",
      TIMEOUT: 10000,
    },
    staging: {
      API_URL:
        process.env.STAGING_API_URL ||
        "https://staging-api.hcw-home.com/api/v1",
      WS_URL: process.env.STAGING_WS_URL || "https://staging-api.hcw-home.com",
      TIMEOUT: 15000,
    },
    production: {
      API_URL:
        process.env.PRODUCTION_API_URL || "https://api.hcw-home.com/api/v1",
      WS_URL: process.env.PRODUCTION_WS_URL || "https://api.hcw-home.com",
      TIMEOUT: 20000,
    },
  },
};

class ProductionConnectionTest {
  constructor(environment = "development") {
    this.environment = environment;
    this.config = CONFIG.ENVIRONMENTS[environment];

    if (!this.config) {
      throw new Error(`Invalid environment: ${environment}`);
    }

    console.log(
      `🔍 Testing Patient-Backend Connection for: ${environment.toUpperCase()}`
    );
    console.log(`📍 API URL: ${this.config.API_URL}`);
    console.log(`📍 WS URL: ${this.config.WS_URL}`);
    console.log("═".repeat(80));
  }

  async runAllTests() {
    const results = {
      environment: this.environment,
      timestamp: new Date().toISOString(),
      tests: {},
      summary: {
        passed: 0,
        failed: 0,
        warnings: 0,
        total: 0,
      },
    };

    const tests = [
      { name: "Backend Health Check", method: this.testHealthCheck.bind(this) },
      {
        name: "Authentication Endpoints",
        method: this.testAuthEndpoints.bind(this),
      },
      {
        name: "Consultation Endpoints",
        method: this.testConsultationEndpoints.bind(this),
      },
      {
        name: "WebSocket Connectivity",
        method: this.testWebSocketConnectivity.bind(this),
      },
      { name: "Static Resources", method: this.testStaticResources.bind(this) },
      { name: "Error Handling", method: this.testErrorHandling.bind(this) },
      {
        name: "Performance Metrics",
        method: this.testPerformanceMetrics.bind(this),
      },
      { name: "Security Headers", method: this.testSecurityHeaders.bind(this) },
    ];

    for (const test of tests) {
      console.log(`\n🧪 ${test.name}...`);
      try {
        const result = await test.method();
        results.tests[test.name] = result;

        if (result.passed) {
          results.summary.passed++;
          console.log(`✅ ${test.name}: PASSED`);
        } else {
          results.summary.failed++;
          console.log(`❌ ${test.name}: FAILED`);
        }

        if (result.warnings?.length > 0) {
          results.summary.warnings += result.warnings.length;
        }
      } catch (error) {
        results.tests[test.name] = {
          passed: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
        results.summary.failed++;
        console.log(`❌ ${test.name}: ERROR - ${error.message}`);
      }
      results.summary.total++;
    }

    this.generateReport(results);
    return results;
  }

  async testHealthCheck() {
    const startTime = performance.now();

    try {
      const response = await axios.get(
        `${this.config.API_URL.replace("/api/v1", "")}/health`,
        {
          timeout: this.config.TIMEOUT,
        }
      );

      const duration = performance.now() - startTime;
      const warnings = [];

      if (duration > 2000) {
        warnings.push(`Slow response time: ${duration.toFixed(0)}ms`);
      }

      if (!response.data.database?.connected) {
        warnings.push("Database not connected");
      }

      if (!response.data.redis?.connected) {
        warnings.push("Redis not connected");
      }

      return {
        passed: true,
        duration: Math.round(duration),
        status: response.status,
        data: response.data,
        warnings,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        passed: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async testAuthEndpoints() {
    const endpoints = [
      {
        method: "POST",
        path: "/auth/request-magic-link",
        data: { contact: "+1234567890", type: "phone" },
      },
      { method: "GET", path: "/auth/me", expectError: 401 },
    ];

    const results = [];

    for (const endpoint of endpoints) {
      const startTime = performance.now();

      try {
        const config = {
          timeout: this.config.TIMEOUT,
          validateStatus: () => true, // Don't throw on any status
        };

        let response;
        if (endpoint.method === "POST") {
          response = await axios.post(
            `${this.config.API_URL}${endpoint.path}`,
            endpoint.data,
            config
          );
        } else {
          response = await axios.get(
            `${this.config.API_URL}${endpoint.path}`,
            config
          );
        }

        const duration = performance.now() - startTime;
        const passed = endpoint.expectError
          ? response.status === endpoint.expectError
          : response.status < 400;

        results.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          passed,
          status: response.status,
          duration: Math.round(duration),
          expected: endpoint.expectError || "2xx/3xx",
        });
      } catch (error) {
        results.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          passed: false,
          error: error.message,
        });
      }
    }

    return {
      passed: results.every((r) => r.passed),
      results,
      timestamp: new Date().toISOString(),
    };
  }

  async testConsultationEndpoints() {
    const endpoints = [
      {
        method: "GET",
        path: "/consultation/1/session-status",
        expectError: 401,
      },
      {
        method: "GET",
        path: "/consultation/patient/history?patientId=1",
        expectError: 401,
      },
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const config = {
          timeout: this.config.TIMEOUT,
          validateStatus: () => true,
        };

        let response;
        if (endpoint.method === "POST") {
          response = await axios.post(
            `${this.config.API_URL}${endpoint.path}`,
            endpoint.data,
            config
          );
        } else {
          response = await axios.get(
            `${this.config.API_URL}${endpoint.path}`,
            config
          );
        }

        const passed = endpoint.expectError
          ? response.status === endpoint.expectError
          : response.status < 400;

        results.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          passed,
          status: response.status,
          expected: endpoint.expectError || "2xx/3xx",
        });
      } catch (error) {
        results.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          passed: false,
          error: error.message,
        });
      }
    }

    return {
      passed: results.every((r) => r.passed),
      results,
      timestamp: new Date().toISOString(),
    };
  }

  async testWebSocketConnectivity() {
    return new Promise((resolve) => {
      try {
        const WebSocket = require("ws");
        const wsUrl =
          this.config.WS_URL.replace("http", "ws") +
          "/socket.io/?transport=websocket";
        const startTime = performance.now();

        const ws = new WebSocket(wsUrl);

        const timeout = setTimeout(() => {
          ws.close();
          resolve({
            passed: false,
            error: "Connection timeout",
            timestamp: new Date().toISOString(),
          });
        }, 5000);

        ws.on("open", () => {
          const duration = performance.now() - startTime;
          clearTimeout(timeout);
          ws.close();

          resolve({
            passed: true,
            duration: Math.round(duration),
            timestamp: new Date().toISOString(),
          });
        });

        ws.on("error", (error) => {
          clearTimeout(timeout);
          resolve({
            passed: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        });
      } catch (error) {
        resolve({
          passed: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  async testStaticResources() {
    const resources = [
      "/uploads", // This might 404, which is expected
    ];

    const results = [];

    for (const resource of resources) {
      try {
        const response = await axios.get(
          `${this.config.API_URL.replace("/api/v1", "")}${resource}`,
          {
            timeout: this.config.TIMEOUT,
            validateStatus: () => true,
          }
        );

        // For uploads endpoint, 404 is acceptable (no files)
        const passed =
          resource === "/uploads"
            ? [200, 404].includes(response.status)
            : response.status < 400;

        results.push({
          resource,
          passed,
          status: response.status,
        });
      } catch (error) {
        results.push({
          resource,
          passed: false,
          error: error.message,
        });
      }
    }

    return {
      passed: results.every((r) => r.passed),
      results,
      timestamp: new Date().toISOString(),
    };
  }

  async testErrorHandling() {
    const errorTests = [
      { path: "/non-existent-endpoint", expectedStatus: 404 },
      { path: "/auth/invalid-endpoint", expectedStatus: 404 },
    ];

    const results = [];

    for (const test of errorTests) {
      try {
        const response = await axios.get(`${this.config.API_URL}${test.path}`, {
          timeout: this.config.TIMEOUT,
          validateStatus: () => true,
        });

        const passed = response.status === test.expectedStatus;

        results.push({
          test: test.path,
          passed,
          actualStatus: response.status,
          expectedStatus: test.expectedStatus,
          hasErrorMessage: !!response.data?.message,
        });
      } catch (error) {
        results.push({
          test: test.path,
          passed: false,
          error: error.message,
        });
      }
    }

    return {
      passed: results.every((r) => r.passed),
      results,
      timestamp: new Date().toISOString(),
    };
  }

  async testPerformanceMetrics() {
    const tests = [];
    const endpoints = ["/health", "/api/v1/health"];

    for (const endpoint of endpoints) {
      const times = [];

      for (let i = 0; i < 3; i++) {
        const startTime = performance.now();

        try {
          await axios.get(
            `${this.config.API_URL.replace("/api/v1", "")}${endpoint}`,
            {
              timeout: this.config.TIMEOUT,
            }
          );

          times.push(performance.now() - startTime);
        } catch (error) {
          times.push(-1); // Error marker
        }
      }

      const validTimes = times.filter((t) => t > 0);
      const avgTime =
        validTimes.length > 0
          ? validTimes.reduce((a, b) => a + b) / validTimes.length
          : -1;

      tests.push({
        endpoint,
        averageResponseTime: Math.round(avgTime),
        successRate: (validTimes.length / times.length) * 100,
        passed: avgTime > 0 && avgTime < 5000, // Less than 5 seconds
      });
    }

    return {
      passed: tests.every((t) => t.passed),
      metrics: tests,
      timestamp: new Date().toISOString(),
    };
  }

  async testSecurityHeaders() {
    try {
      const response = await axios.get(
        `${this.config.API_URL.replace("/api/v1", "")}/health`,
        {
          timeout: this.config.TIMEOUT,
        }
      );

      const headers = response.headers;
      const securityChecks = {
        "x-content-type-options":
          headers["x-content-type-options"] === "nosniff",
        "x-frame-options": !!headers["x-frame-options"],
        "x-xss-protection":
          !!headers["x-xss-protection"] || !!headers["x-content-type-options"], // Modern alternative
        "strict-transport-security":
          this.environment === "production"
            ? !!headers["strict-transport-security"]
            : true,
      };

      const passedChecks = Object.values(securityChecks).filter(Boolean).length;
      const totalChecks = Object.keys(securityChecks).length;

      return {
        passed: passedChecks >= totalChecks * 0.75, // At least 75% of security headers
        securityChecks,
        score: `${passedChecks}/${totalChecks}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        passed: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  generateReport(results) {
    console.log("\n" + "═".repeat(80));
    console.log("📊 PATIENT-BACKEND CONNECTION TEST REPORT");
    console.log("═".repeat(80));
    console.log(`Environment: ${results.environment.toUpperCase()}`);
    console.log(`Timestamp: ${results.timestamp}`);
    console.log(`Total Tests: ${results.summary.total}`);
    console.log(`✅ Passed: ${results.summary.passed}`);
    console.log(`❌ Failed: ${results.summary.failed}`);
    console.log(`⚠️  Warnings: ${results.summary.warnings}`);

    const successRate = (
      (results.summary.passed / results.summary.total) *
      100
    ).toFixed(1);
    console.log(`📈 Success Rate: ${successRate}%`);

    console.log("\n📋 Test Details:");
    Object.entries(results.tests).forEach(([testName, result]) => {
      const status = result.passed ? "✅" : "❌";
      console.log(`  ${status} ${testName}`);

      if (result.warnings?.length > 0) {
        result.warnings.forEach((warning) => {
          console.log(`    ⚠️  ${warning}`);
        });
      }

      if (!result.passed && result.error) {
        console.log(`    💥 ${result.error}`);
      }
    });

    // Save report to file
    const reportFile = `connection-test-report-${
      results.environment
    }-${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`\n📄 Full report saved to: ${reportFile}`);

    console.log("═".repeat(80));

    // Recommendations
    if (results.summary.failed > 0) {
      console.log("\n🔧 RECOMMENDATIONS:");

      if (!results.tests["Backend Health Check"]?.passed) {
        console.log("  • Check if the backend server is running");
        console.log("  • Verify the API URL configuration");
        console.log("  • Check network connectivity");
      }

      if (!results.tests["WebSocket Connectivity"]?.passed) {
        console.log("  • Check WebSocket server configuration");
        console.log("  • Verify firewall settings for WebSocket connections");
      }

      if (
        results.tests["Performance Metrics"]?.metrics?.some((m) => !m.passed)
      ) {
        console.log("  • Consider optimizing backend response times");
        console.log("  • Check server resources and scaling");
      }

      console.log("═".repeat(80));
    }
  }
}

// CLI execution
if (require.main === module) {
  const environment = process.argv[2] || "development";

  const tester = new ProductionConnectionTest(environment);

  tester
    .runAllTests()
    .then((results) => {
      const exitCode = results.summary.failed > 0 ? 1 : 0;
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error("❌ Test execution failed:", error.message);
      process.exit(1);
    });
}

module.exports = ProductionConnectionTest;
