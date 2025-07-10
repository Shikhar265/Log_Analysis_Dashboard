/**
 * Security analysis and detection
 */

// Security issue counter for dashboard
let securityIssueCount = 0

/**
 * Analyze logs for security issues and update alerts
 * @param {Array} logs - Filtered logs to analyze
 */
function analyzeSecurityIssues(logs) {
  const securityAlerts = []
  securityIssueCount = 0

  // Group logs by IP to detect suspicious activity
  const ipLogs = groupByIP(logs)

  // Check for brute force login attempts
  const bruteForceAttempts = detectBruteForceAttempts(ipLogs)
  securityAlerts.push(...bruteForceAttempts)

  // Check for SQL injection attempts
  const sqlInjectionAttempts = detectSQLInjection(logs)
  securityAlerts.push(...sqlInjectionAttempts)

  // Check for unusual HTTP methods
  const unusualMethodAttempts = detectUnusualMethods(logs)
  securityAlerts.push(...unusualMethodAttempts)

  // Check for unusual endpoint scanning
  const endpointScanningAttempts = detectEndpointScanning(ipLogs)
  securityAlerts.push(...endpointScanningAttempts)

  // Check for large number of errors
  const highErrorRates = detectHighErrorRates(logs)
  securityAlerts.push(...highErrorRates)

  // Update total count
  securityIssueCount = securityAlerts.length
  document.getElementById("security-issues").textContent = securityIssueCount

  // Display alerts in the sidebar
  renderSecurityAlerts(securityAlerts)
}

/**
 * Group logs by IP address
 */
function groupByIP(logs) {
  const ipGroups = {}

  logs.forEach((log) => {
    if (!log.ipAddress) return

    if (!ipGroups[log.ipAddress]) {
      ipGroups[log.ipAddress] = []
    }

    ipGroups[log.ipAddress].push(log)
  })

  return ipGroups
}

/**
 * Detect brute force login attempts (multiple failed logins from same IP)
 */
function detectBruteForceAttempts(ipLogs) {
  const alerts = []
  const failedLoginThreshold = 5

  for (const ip in ipLogs) {
    const logs = ipLogs[ip]

    // Find failed authentication logs (status 401 or 403)
    const failedLogins = logs.filter(
      (log) =>
        (log.status === 401 || log.status === 403) &&
        log.path &&
        log.path.toLowerCase().includes("login")
    )

    if (failedLogins.length >= failedLoginThreshold) {
      // Sort by timestamp for latest attempts
      failedLogins.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

      // Calculate time window of attempts
      const latest = new Date(failedLogins[0].timestamp)
      const earliest = new Date(failedLogins[failedLogins.length - 1].timestamp)
      const timeSpan = Math.round((latest - earliest) / 60000) // minutes

      alerts.push({
        title: "Potential Brute Force Attack",
        message: `${failedLogins.length} failed login attempts from IP ${ip} within ${timeSpan} minutes`,
        severity: failedLogins.length >= 10 ? "high" : "medium",
        timestamp: latest,
        ip: ip,
        count: failedLogins.length,
      })
    }
  }

  return alerts
}

/**
 * Detect potential SQL injection attempts
 */
function detectSQLInjection(logs) {
  const alerts = []
  const sqlPatterns = [
    "SELECT",
    "UNION",
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "1=1",
    "OR 1=1",
    "' OR '",
    "' OR 1=1",
    "--",
    "/*",
    "EXEC",
    "EXECUTE",
    "xp_",
    "sp_",
  ]

  // Check logs for SQL injection patterns in path, query or body
  logs.forEach((log) => {
    // Skip if no IP address
    if (!log.ipAddress) return

    let hasSQLPattern = false
    let matchedPattern = ""

    // Check in URL path
    if (log.path) {
      for (const pattern of sqlPatterns) {
        if (log.path.toUpperCase().includes(pattern)) {
          hasSQLPattern = true
          matchedPattern = pattern
          break
        }
      }
    }

    // Check in message or details
    if (!hasSQLPattern && (log.message || log.details)) {
      const content = (log.message || "") + (log.details || "")
      for (const pattern of sqlPatterns) {
        if (content.toUpperCase().includes(pattern)) {
          hasSQLPattern = true
          matchedPattern = pattern
          break
        }
      }
    }

    if (hasSQLPattern) {
      alerts.push({
        title: "Potential SQL Injection Attempt",
        message: `Suspicious SQL pattern "${matchedPattern}" detected from IP ${log.ipAddress}`,
        severity: "high",
        timestamp: new Date(log.timestamp),
        ip: log.ipAddress,
        path: log.path,
      })
    }
  })

  return alerts
}

/**
 * Detect unusual HTTP methods
 */
function detectUnusualMethods(logs) {
  const alerts = []
  const commonMethods = [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "HEAD",
    "OPTIONS",
  ]

  // Check for uncommon HTTP methods
  logs.forEach((log) => {
    if (!log.method || !log.ipAddress) return

    if (!commonMethods.includes(log.method)) {
      alerts.push({
        title: "Unusual HTTP Method",
        message: `Uncommon HTTP method "${log.method}" used by IP ${log.ipAddress}`,
        severity: "low",
        timestamp: new Date(log.timestamp),
        ip: log.ipAddress,
        method: log.method,
        path: log.path,
      })
    }
  })

  return alerts
}

/**
 * Detect potential endpoint scanning (many different endpoints in short time)
 */
function detectEndpointScanning(ipLogs) {
  const alerts = []
  const endpointThreshold = 15 // Many different endpoints in a short time
  const timeWindowMinutes = 5

  for (const ip in ipLogs) {
    const logs = ipLogs[ip]

    // Continue if not enough logs
    if (logs.length < endpointThreshold) continue

    // Sort logs by timestamp
    logs.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    // Check for unique endpoints within time windows
    for (let i = 0; i < logs.length - endpointThreshold; i++) {
      const startTime = new Date(logs[i].timestamp)
      const endTime = new Date(logs[i + endpointThreshold - 1].timestamp)

      // Check if within time window
      const minutesDiff = (endTime - startTime) / 60000

      if (minutesDiff <= timeWindowMinutes) {
        // Count unique endpoints
        const uniquePaths = new Set()
        for (let j = i; j < i + endpointThreshold; j++) {
          if (logs[j].path) uniquePaths.add(logs[j].path)
        }

        if (uniquePaths.size >= endpointThreshold) {
          alerts.push({
            title: "Potential Endpoint Scanning",
            message: `IP ${ip} accessed ${
              uniquePaths.size
            } different endpoints within ${minutesDiff.toFixed(1)} minutes`,
            severity: "medium",
            timestamp: endTime,
            ip: ip,
            count: uniquePaths.size,
          })

          // Skip ahead to avoid duplicate alerts
          i += endpointThreshold
        }
      }
    }
  }

  return alerts
}

/**
 * Detect high error rates
 */
function detectHighErrorRates(logs) {
  const alerts = []

  if (logs.length < 10) return alerts

  // Count error status codes (500+)
  const serverErrors = logs.filter((log) => log.status >= 500)
  const errorRate = serverErrors.length / logs.length

  if (errorRate >= 0.1 && serverErrors.length >= 5) {
    // Get most recent error timestamp
    const latestError = new Date(
      Math.max(...serverErrors.map((log) => new Date(log.timestamp).getTime()))
    )

    alerts.push({
      title: "High Server Error Rate",
      message: `Server error rate is ${(errorRate * 100).toFixed(1)}% (${
        serverErrors.length
      } out of ${logs.length} requests)`,
      severity: errorRate >= 0.25 ? "high" : "medium",
      timestamp: latestError,
      count: serverErrors.length,
    })
  }

  return alerts
}

/**
 * Render security alerts in the sidebar
 */
function renderSecurityAlerts(alerts) {
  const alertsContainer = document.getElementById("security-alerts")

  if (alerts.length === 0) {
    alertsContainer.innerHTML = `
      <div class="alert-placeholder">No security alerts detected</div>
    `
    return
  }

  // Sort alerts by severity (high to low) and then by timestamp (newest first)
  const sortedAlerts = alerts.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 }
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity]
    }
    return b.timestamp - a.timestamp
  })

  // Generate HTML for alerts
  alertsContainer.innerHTML = sortedAlerts
    .slice(0, 5)
    .map((alert) => {
      const timeString = alert.timestamp.toLocaleString()

      return `
      <div class="alert-item ${alert.severity}">
        <div class="alert-header">
          <div class="alert-title">${alert.title}</div>
          <div class="alert-severity ${alert.severity}">${alert.severity}</div>
        </div>
        <div class="alert-message">${alert.message}</div>
        <div class="alert-meta">
          <span><i class="fas fa-clock"></i> ${timeString}</span>
          ${
            alert.ip
              ? `<span><i class="fas fa-network-wired"></i> ${alert.ip}</span>`
              : ""
          }
        </div>
      </div>
    `
    })
    .join("")

  // Add a "View All" link if there are more alerts
  if (alerts.length > 5) {
    alertsContainer.innerHTML += `
      <div class="alert-view-more">
        <button id="view-all-alerts" class="btn btn-small">
          View all ${alerts.length} alerts
        </button>
      </div>
    `

    // Add event listener for view all button
    setTimeout(() => {
      const viewAllBtn = document.getElementById("view-all-alerts")
      if (viewAllBtn) {
        viewAllBtn.addEventListener("click", () =>
          showAllSecurityAlerts(alerts)
        )
      }
    }, 0)
  }
}

/**
 * Show all security alerts in a modal
 */
function showAllSecurityAlerts(alerts) {
  const modal = document.getElementById("log-detail-modal")
  const content = document.getElementById("log-detail-content")

  // Sort alerts by severity and timestamp
  const sortedAlerts = alerts.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 }
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity]
    }
    return b.timestamp - a.timestamp
  })

  // Generate HTML for alerts
  let html = `
    <div class="security-alerts-modal">
      <h3>All Security Alerts (${alerts.length})</h3>
      <div class="security-alerts-list">
  `

  html += sortedAlerts
    .map((alert) => {
      const timeString = alert.timestamp.toLocaleString()

      return `
      <div class="alert-item ${alert.severity}">
        <div class="alert-header">
          <div class="alert-title">${alert.title}</div>
          <div class="alert-severity ${alert.severity}">${alert.severity}</div>
        </div>
        <div class="alert-message">${alert.message}</div>
        <div class="alert-meta">
          <span><i class="fas fa-clock"></i> ${timeString}</span>
          ${
            alert.ip
              ? `<span><i class="fas fa-network-wired"></i> ${alert.ip}</span>`
              : ""
          }
          ${
            alert.path
              ? `<span><i class="fas fa-link"></i> ${alert.path}</span>`
              : ""
          }
        </div>
      </div>
    `
    })
    .join("")

  html += `
      </div>
    </div>
  `

  content.innerHTML = html
  modal.style.display = "block"
}
